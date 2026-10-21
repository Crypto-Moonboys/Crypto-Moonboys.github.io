import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { projectSavedMoonpetClaims, SAVED_CLAIM_KEYS } from '../workers/moonboys-api/player-action-plan/moonpet-saved-claims.js';
import { getMoonpetSeasonKey } from '../workers/moonboys-api/pets/season-authority.js';
import { seasonFinaleKey } from '../workers/moonboys-api/pets/completion-policy.js';
import { actionPlanTask } from '../workers/moonboys-api/player-action-plan/schema.js';

const NOW = new Date('2026-10-21T12:00:00Z');
const OWNER = 'signed-owner';
const SEASON = getMoonpetSeasonKey(NOW);
function fixture(options = {}) {
  const calls = [];
  const statuses = Object.fromEntries(Object.values(SAVED_CLAIM_KEYS).map(key => [key, { state: 'live' }]));
  const failures = new Map();
  const rows = {
    cache: options.cache ? [{ event_key: 'chest-accepted', created_at: NOW.toISOString() }] : [],
    season: options.seasonRows || (options.seasonXp == null ? [] : [{ season_key: SEASON, season_xp: options.seasonXp }]),
    claim: options.claimRows || (options.tierAcknowledged ?
      [{ season_key: SEASON, tier_id: 'street', claimed_at: NOW.toISOString() }] : []),
    receipt: options.receiptRows || (options.tierReceipt ? [{ idempotency_key: 'season_reward:' + OWNER + ':' + (options.receiptSeason || SEASON) + ':street',
      status: options.tierReceipt, awarded_at: NOW.toISOString() }] : []),
    finale: options.finaleRows || (options.finale ? [{
      pet_id: 'secret-pet', season_key: 'pet-s2026-004', competition_season_key: SEASON,
      status: 'won', defeated_at: NOW.toISOString(), claimed_at: options.finaleClaimed ? NOW.toISOString() : null,
      reward_key: options.finaleRewardKey ?? seasonFinaleKey('secret-pet', SEASON), owner_verified: options.wrongPet ? 0 : 1,
      receipt_status: options.finaleReceipt || null,
    }] : []),
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
      pets: options.noPets ? [] : [{ pet_id: 'secret-pet',
        is_active: options.noSelectedPet ? 0 : 1,
        lifecycle_phase: options.missingLifecycle ? null : 'young' }],
      rosterUnavailable: Boolean(options.rosterUnavailable),
      sourceStatuses: statuses, failures, query,
      makeTask: input => input,
      // Mirror stable opaque identity, not an identical stub for every pet.
      opaqueRef: async value => value === OWNER + ':secret-pet' ? 'opaque:pet' :
        'opaque:' + createHash('sha256').update(String(value)).digest('hex').slice(0, 24),
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

test('tier readiness requires selected pet lifecycle, not merely any owned roster row', async () => {
  for (const option of [{ missingLifecycle: true }, { noSelectedPet: true }]) {
    const tasks = await fixture({ seasonXp: 500, ...option }).project();
    const tier = get(tasks, 'tiers').find(x => x.task_id.endsWith(':street'));
    assert.equal(tier.status, 'blocked');
    assert.ok(['selected_moonpet_required', 'selected_pet_lifecycle_unverified'].includes(tier.blocking_reason_code));
  }
  const ready = await fixture({ seasonXp: 500 }).project();
  assert.equal(get(ready, 'tiers').find(x => x.task_id.endsWith(':street')).status, 'claim_ready');
});

test('tier reward base is explicitly unconfirmed because evolution stage changes Style Tokens', async () => {
  const ready = await fixture({ seasonXp: 500 }).project();
  const tier = get(ready, 'tiers').find(x => x.task_id.endsWith(':street'));
  assert.equal(tier.status, 'claim_ready');
  assert.equal(tier.reward.confirmed, false);
  assert.match(tier.description, /evolution-stage bonus/u);
  const claimed = await fixture({ seasonXp: 500, tierReceipt: 'awarded' }).project();
  assert.equal(get(claimed, 'tiers').find(x => x.task_id.endsWith(':street')).reward.confirmed, false,
    'even an awarded tier must not claim the base style token amount is the exact payout');
});

test('canonical and legacy Finale reward keys permit genuine claims; arbitrary or mismatched keys are blocked', async () => {
  const validCurrent = await fixture({ finale: true }).project();
  assert.equal(get(validCurrent, 'finale')[0].status, 'claim_ready');
  const legacy = await fixture({ finale: true,
    finaleRewardKey: 'season-finale:secret-pet:pet-s2026-004' }).project();
  assert.equal(get(legacy, 'finale')[0].status, 'claim_ready');
  for (const bad of [
    'unrelated-final-reward',
    seasonFinaleKey('another-pet', SEASON),
    seasonFinaleKey('secret-pet', 'pet-s2026-003'),
    'season-finale:secret-pet:pet-s2026-003',
    '',
  ]) {
    const f = fixture({ finale: true, finaleRewardKey: bad });
    const tasks = await f.project();
    const finale = get(tasks, 'finale')[0];
    assert.equal(finale.status, 'blocked', bad);
    assert.equal(finale.blocking_reason_code, 'finale_reward_key_unverified', bad);
    assert.equal(finale.evidence.verified_completion, false);
    assert.equal(finale.source_pet_ref, null, 'invalid reward keys must not assert verified original-pet attribution');
  }
  const badPaid = await fixture({ finale: true,
    finaleRewardKey: 'unrelated-final-reward', finaleReceipt: 'awarded' }).project();
  assert.equal(get(badPaid, 'finale')[0].status, 'blocked',
    'malformed reward keys must not create claim-ready OR confirmed claimed badges');
});

test('rejected season receipt never promotes earned tiers or receipt-only history to claim_ready', async () => {
  const current = await fixture({ seasonXp: 500, tierReceipt: 'rejected' }).project();
  const tier = get(current, 'tiers').find(t => t.task_id.endsWith(':street'));
  assert.equal(tier.status, 'blocked');
  assert.equal(tier.blocking_reason_code, 'season_reward_settlement_rejected');
  assert.equal(tier.evidence.verified_completion, false);
  const historical = await fixture({ tierReceipt: 'rejected', receiptSeason: 'pet-s2026-003' }).project();
  const saved = get(historical, 'tiers').find(t =>
    t.period.key === 'pet-s2026-003' && t.task_id.endsWith(':street'));
  assert.ok(saved, 'receipt-only rejected historical season must remain visible');
  assert.equal(saved.status, 'blocked');
  assert.equal(saved.blocking_reason_code, 'season_reward_settlement_rejected');
  assert.notEqual(saved.status, 'claimed');
});

test('rejected Finale receipts stay blocked and are not represented as awarded', async () => {
  const tasks = await fixture({ finale: true, finaleReceipt: 'rejected' }).project();
  const finale = get(tasks, 'finale')[0];
  assert.equal(finale.status, 'blocked');
  assert.equal(finale.blocking_reason_code, 'finale_settlement_rejected');
  assert.equal(finale.evidence.verified_completion, false);
  assert.equal(finale.reward.confirmed, false);
});

test('separate malformed Finale wins retain unique opaque task IDs with no pet attribution', async () => {
  const finaleRows = ['pet-1','pet-2','pet-3'].map(pet_id => ({
    pet_id, season_key: SEASON, competition_season_key: SEASON,
    reward_key: 'bad-key', status: 'won', owner_verified: 0,
    defeated_at: NOW.toISOString(), claimed_at: null, receipt_status: null,
  }));
  const tasks = await fixture({ finaleRows }).project();
  const finales = get(tasks, 'finale');
  assert.equal(finales.length, 3);
  assert.equal(new Set(finales.map(t => t.task_id)).size, 3,
    'history and pagination must not deduplicate invalid rows');
  assert.ok(finales.every(t => t.status === 'blocked' && t.source_pet_ref === null));
  assert.ok(finales.every(t => t.task_id.startsWith('moonpet.finale-claim:') &&
    !t.task_id.includes('bad-key') &&
    !['pet-1','pet-2','pet-3'].some(id => t.task_id.includes(':' + id + ':'))));
});

test('long malformed competition periods cannot truncate away distinct opaque Finale IDs', async () => {
  const veryLongPeriod = 'unverified-quarter-' + 'x'.repeat(300);
  const finaleRows = ['first-pet', 'second-pet'].map(pet_id => ({
    pet_id, season_key: SEASON, competition_season_key: veryLongPeriod,
    reward_key: 'unverified-key', status: 'won', owner_verified: 0,
    defeated_at: NOW.toISOString(), claimed_at: null, receipt_status: null,
  }));
  const a = await fixture({ finaleRows }).project();
  const b = await fixture({ finaleRows }).project();
  const first = get(a, 'finale').map(actionPlanTask);
  const second = get(b, 'finale').map(actionPlanTask);
  assert.equal(first.length, 2);
  assert.equal(new Set(first.map(row => row.task_id)).size, 2,
    'schema truncation must never collapse distinct malformed Finale claims');
  assert.deepEqual(first.map(row => row.task_id), second.map(row => row.task_id),
    'opaque identities must be stable across signed refreshes');
  assert.ok(first.every(row => row.task_id.length < 220 &&
    /^moonpet[.]finale-claim:opaque:[a-f0-9]{24}$/u.test(row.task_id)),
    'the task ID is source-key + bounded opaque hash, never raw period or pet ID');
  assert.ok(first.every(row => row.status === 'blocked' &&
    row.source_pet_ref === null && row.evidence.verified_completion === false));
  assert.ok(first.every(row => row.period.kind === 'saved_claim'),
    'the source period must remain available as separate bounded metadata');
});

test('Saved Status destinations preserve supported MoonPet screen and focus in the navigable URL', async () => {
  const tasks = await fixture({ cache: true, seasonXp: 500, finale: true }).project();
  const expected = {
    cache: ['home','care'],
    tiers: ['profile','season'],
    finale: ['missions','season-finale'],
    bonus: ['economy','bonus-bounties'],
    weekly: ['economy','weekly-bounties'],
  };
  for (const [key,[screen,focus]] of Object.entries(expected)) {
    const rows = get(tasks,key);
    assert.ok(rows.length > 0, key);
    for (const task of rows) {
      assert.equal(task.destination.path,
        '/moonpet-game.html?screen=' + screen + '&focus=' + focus, key);
    }
  }
});

test('Finale nominal reward is unconfirmed even for an awarded receipt because caps can reduce Pet XP', async () => {
  const paid = await fixture({ finale: true, finaleReceipt: 'awarded', finaleClaimed: true }).project();
  const finale = get(paid, 'finale')[0];
  assert.equal(finale.status, 'claimed');
  assert.equal(finale.reward.confirmed, false);
  assert.ok(finale.reward.items.some(item => item.type === 'pet_xp' && item.amount === 100));
});

test('truncated Finale victory history advertises partial source and an explicit overflow, never 61 complete rows', async () => {
  const finaleRows = Array.from({ length: 61 }, (_, index) => ({
    pet_id: 'secret-pet-' + index, season_key: SEASON,
    competition_season_key: SEASON, status: 'won',
    defeated_at: NOW.toISOString(), claimed_at: null,
    reward_key: seasonFinaleKey('secret-pet-' + index, SEASON), owner_verified: 1, receipt_status: null,
  }));
  const f = fixture({ finaleRows });
  const tasks = await f.project();
  const finales = get(tasks, 'finale');
  assert.equal(finales.filter(x => x.status === 'claim_ready').length, 60);
  const warning = finales.find(x => x.blocking_reason_code === 'saved_finale_history_partial');
  assert.ok(warning, 'older saved rewards must remain explicitly discoverable');
  assert.equal(warning.status, 'preview');
  assert.equal(warning.source_health, 'preview');
  assert.equal(f.statuses[SAVED_CLAIM_KEYS.finale].partial, true);
  assert.equal(f.statuses[SAVED_CLAIM_KEYS.finale].historical_rows_in_preview, 60);
  assert.ok(f.calls.some(call => call.sql.includes('LIMIT 61')),
    'fetch one extra Finale row as truncation evidence');
  assert.ok(!JSON.stringify(finales).includes('secret-pet-60'));
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

test('pending historical tier payout remains blocked when old season XP aggregate is missing', async () => {
  const old = 'pet-s2026-003';
  const f = fixture({ tierReceipt: 'pending', receiptSeason: old });
  const tasks = await f.project();
  const pending = get(tasks, 'tiers').find(row =>
    row.period.key === old && row.task_id.endsWith(':street'));
  assert.ok(pending, 'pending receipt-only historical season must not silently disappear');
  assert.equal(pending.status, 'blocked');
  assert.equal(pending.blocking_reason_code, 'season_reward_settlement_pending');
  assert.equal(pending.evidence.verified_completion, false);
  assert.ok(!get(tasks, 'tiers').some(row =>
    row.period.key === old && row.status === 'claim_ready'));
});

test('unopened Daily Cache has UTC-day preview for Today with unknown claim readiness', async () => {
  const f = fixture();
  const tasks = await f.project();
  const cache = get(tasks, 'cache')[0];
  assert.equal(cache.status, 'preview');
  assert.equal(cache.period.kind, 'utc_day');
  assert.equal(cache.period.key, '2026-10-21');
  assert.equal(cache.source_health, 'preview');
  assert.equal(cache.progress.current, null);
  assert.equal(cache.blocking_reason_code, 'daily_cache_eligibility_unverified');
  assert.notEqual(cache.status, 'claim_ready');
});

test('failed bonus and weekly D1 reads preserve unknown progress instead of fabricated zeroes', async () => {
  for (const key of ['bonus', 'weekly']) {
    const sourceKey = SAVED_CLAIM_KEYS[key];
    const f = fixture({ failKey: sourceKey });
    const tasks = await f.project();
    const entries = get(tasks, key);
    assert.equal(f.failures.get(sourceKey), 'simulated_source_failure');
    assert.equal(entries.length, 1, 'failed event read must not emit individual zero-progress objectives');
    assert.equal(entries[0].status, 'preview');
    assert.equal(entries[0].source_health, 'preview');
    assert.equal(entries[0].progress.current, null);
    assert.equal(entries[0].progress.target, null);
    assert.equal(entries[0].blocking_reason_code, 'source_events_unavailable');
    assert.equal(entries[0].period.kind, key === 'bonus' ? 'utc_day' : 'source_defined');
  }
});

test('failed Daily Cache read stays unknown and does not imply unclaimed eligibility', async () => {
  const f = fixture({ failKey: SAVED_CLAIM_KEYS.cache });
  const tasks = await f.project();
  const entries = get(tasks, 'cache');
  assert.equal(f.failures.has(SAVED_CLAIM_KEYS.cache), true);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].period.kind, 'utc_day');
  assert.equal(entries[0].status, 'preview');
  assert.equal(entries[0].progress.current, null);
  assert.equal(entries[0].source_health, 'preview');
});

test('historical acknowledgement without season XP or payout receipt remains blocked, not omitted', async () => {
  const old = 'pet-s2026-003';
  const f = fixture({ claimRows: [{ season_key: old, tier_id: 'street',
    claimed_at: NOW.toISOString() }] });
  const tasks = await f.project();
  const oldTier = get(tasks, 'tiers').find(row =>
    row.period.key === old && row.task_id.endsWith(':street'));
  assert.ok(oldTier, 'persisted acknowledgement-only history must not disappear');
  assert.equal(oldTier.status, 'blocked');
  assert.equal(oldTier.blocking_reason_code, 'season_reward_receipt_unverified');
  assert.equal(oldTier.evidence.verified_completion, false);
  assert.equal(oldTier.reward.confirmed, false);
  assert.equal(oldTier.progress.current, 0, 'no source season XP may be inferred');
  assert.notEqual(oldTier.status, 'claim_ready');
  assert.notEqual(oldTier.status, 'claimed');
  assert.equal(f.statuses[SAVED_CLAIM_KEYS.tiers].state, 'live',
    'acknowledgement-only source is not empty');
  assert.equal(f.statuses[SAVED_CLAIM_KEYS.tiers].adapter, 'season_xp_claims_and_receipts');
});

test('malformed, unknown or future acknowledgement-only seasons never fabricate an old tier', async () => {
  const f = fixture({ claimRows: [
    { season_key: 'pet-s2026-003', tier_id: 'unlisted_tier' },
    { season_key: 'invalid-season', tier_id: 'street' },
    { season_key: 'pet-s2027-001', tier_id: 'street' },
  ] });
  const tasks = await f.project();
  assert.ok(!get(tasks, 'tiers').some(row =>
    row.period.key === 'pet-s2026-003' ||
    row.period.key === 'invalid-season' ||
    row.period.key === 'pet-s2027-001'));
  assert.equal(f.statuses[SAVED_CLAIM_KEYS.tiers].state, 'live',
    'a real acknowledgement row is still evidence of a nonempty source');
});

test('17th saved season proves truncated history, advertises older unclaimed tiers and blocks premature readiness', async () => {
  const seasonRows = Array.from({ length: 17 }, (_, index) => {
    const quarterIndex = (2026 * 4 + 3) - index;
    return {
      season_key: 'pet-s' + Math.floor(quarterIndex / 4) +
        '-' + String((quarterIndex % 4) + 1).padStart(3, '0'),
      season_xp: 500,
    };
  });
  const f = fixture({ seasonRows });
  const tasks = await f.project();
  const tiers = get(tasks, 'tiers');
  assert.equal(f.statuses[SAVED_CLAIM_KEYS.tiers].state, 'live');
  assert.equal(f.statuses[SAVED_CLAIM_KEYS.tiers].partial, true);
  assert.equal(f.statuses[SAVED_CLAIM_KEYS.tiers].historical_seasons_in_preview, 16);
  assert.equal(f.statuses[SAVED_CLAIM_KEYS.tiers].historical_seasons_beyond_preview, 'at_least_one');
  const warning = tiers.find(t => t.blocking_reason_code === 'season_tier_history_partial');
  assert.ok(warning, 'older earned/unclaimed season must be called out as an unverified overflow');
  assert.equal(warning.status, 'preview');
  assert.equal(warning.source_health, 'preview');
  assert.match(warning.description, /Older unclaimed tiers may remain/u);
  assert.ok(tiers.every(t => t.status !== 'claim_ready'));
  assert.ok(!tiers.some(t => t.period.key === seasonRows[16].season_key),
    'the sentinel proves omitted history but does not invent the older tier receipt state');
  assert.ok(f.calls.some(call => call.sql.includes('LIMIT 17')));
});

test('exactly 16 season rows do not assert an overflow without a sentinel', async () => {
  const seasonRows = Array.from({ length: 16 }, (_, index) => ({
    season_key: 'pet-s' + (2026 - Math.floor(index / 4)) +
      '-' + String(4 - (index % 4)).padStart(3, '0'),
    season_xp: 100,
  }));
  const f = fixture({ seasonRows });
  const tasks = await f.project();
  assert.notEqual(f.statuses[SAVED_CLAIM_KEYS.tiers].partial, true);
  assert.ok(!get(tasks, 'tiers').some(t => t.blocking_reason_code === 'season_tier_history_partial'));
});

test('a full receipt page is also surfaced as partial rather than treating unseen payouts as absent', async () => {
  const receiptRows = Array.from({ length: 100 }, (_, index) => ({
    idempotency_key: 'season_reward:' + OWNER + ':pet-s2026-004:receipt-' + index,
    status: 'awarded', awarded_at: NOW.toISOString(),
  }));
  const f = fixture({ seasonXp: 500, receiptRows });
  const tasks = await f.project();
  assert.equal(f.statuses[SAVED_CLAIM_KEYS.tiers].partial, true);
  assert.ok(get(tasks, 'tiers').some(t => t.blocking_reason_code === 'season_tier_history_partial'));
  assert.notEqual(get(tasks, 'tiers').find(t => t.task_id.endsWith(':street')).status, 'claim_ready');
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

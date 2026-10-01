import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { PET_DAILY_BOUNTIES } from '../workers/moonboys-api/pets/economy-expansion.js';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const { bountyRouteOptions } = createRequire(import.meta.url)('../js/moonpet-play-options.js');
const careBounty = PET_DAILY_BOUNTIES.find((bounty) => bounty.key === 'care_pair');
const fixedNow = new Date('2026-09-27T12:00:00Z');
for (const offer of hooks.buildPetActivityOptions()) {
  assert.equal(offer.minimum_seconds, 300);
  assert.equal(offer.checkpoints.at(-1).seconds, offer.cap_seconds);
  for (const checkpoint of offer.checkpoints) assert.deepEqual(checkpoint, hooks.computePetActivityRewards(offer.key, checkpoint.seconds));
  for (const elapsed of [0, 299, 300, 1799, 1800, 7199, 7200, offer.cap_seconds, offer.cap_seconds + 1000]) {
    const summary = hooks.buildPetActivitySummary({ activity_type: offer.key, status: 'active', started_at: new Date(fixedNow - elapsed * 1000).toISOString() }, fixedNow);
    assert.equal(summary.ready, elapsed >= 300);
    assert.equal(Boolean(summary.cooldown), elapsed < 300);
    if (elapsed >= 300) assert.deepEqual(summary.preview, hooks.computePetActivityRewards(offer.key, elapsed));
    assert.equal(summary.capped, elapsed >= offer.cap_seconds);
    if (summary.next_checkpoint) {
      assert.ok(summary.next_checkpoint.seconds > elapsed);
      assert.ok(summary.next_checkpoint.cooldown.remaining_seconds > 0);
    } else assert.ok(elapsed >= offer.cap_seconds);
  }
}
assert.equal(hooks.computePetActivityRewards('explore', 1800).rewards.moon_crystals, 1);
assert.equal(hooks.computePetActivityRewards('explore', 7200).rewards.moon_crystals, 0);
assert.equal(hooks.computePetActivityRewards('explore', 7200).rewards.item_key, 'adventure_map');

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
for (const migration of ['058_telegram_pet_season_completion.sql','061_moonpet_season_economy_calibration.sql']) sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/'+migration, import.meta.url),'utf8'));
let failSettlement = false;
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (failSettlement && this.sql.includes('UPDATE telegram_pet_activity_sessions') && this.sql.includes('SET metadata = ?')) {
      failSettlement = false; throw Error('interrupted_settlement');
    }
    if (/\bRETURNING\b/i.test(this.sql)) { const results = sqlite.prepare(this.sql).all(...this.args); return { results, meta: { changes: results.length } }; }
    const result = sqlite.prepare(this.sql).run(...this.args); return { results: [], meta: { changes: Number(result.changes) } };
  }
}
const db = {
  prepare(sql) { return new Statement(sql); },
  async batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const id = 'activity-options-owner';
sqlite.prepare('INSERT INTO telegram_users (telegram_id, first_name, xp, level) VALUES (?, ?, 0, 1)').run(id, id);
sqlite.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_name, pet_xp, level, energy) VALUES (?, ?, 3240, 20, 80)').run(id, id);
await hooks.ensurePetStarterSeasonSlot(db, id);
const pet = await hooks.ensureActivePetInstance(db, id);
sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id, telegram_id, identity_seed, phase, incubation_json, innate_traits_json)
  VALUES (?, ?, 'activity-test', 'young', '{"progress":0,"target":12,"signals":{}}', '[]')`).run(pet.pet_id, id);
const now = new Date();
const act = (action, payload = {}) => dispatchRenderedPetAction(db, id, { id }, { action, ...payload }, 'test-token');
const careActions = ['feed', 'play', 'clean', 'sleep', 'train'];
const assertCareCooldowns = (state, expected) => {
  const entries = state.cooldowns.entries.filter((entry) => careActions.some((action) => entry.key === 'action:' + action));
  assert.deepEqual(entries.map((entry) => entry.key).sort(), expected.map((action) => 'action:' + action).sort(), 'every still-active care cooldown must survive the server snapshot');
  for (const entry of entries) {
    const event = sqlite.prepare(`SELECT strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+45 seconds') AS expires_at
      FROM telegram_pet_events WHERE telegram_id=? AND event_type=? AND status='accepted' ORDER BY created_at DESC LIMIT 1`).get(id, entry.key.slice(7));
    assert.equal(entry.expires_at, event.expires_at, 'expiry must use the accepted event, not the latest refresh or rejected attempt');
    assert.ok(entry.remaining_seconds > 0 && entry.remaining_seconds <= 45);
    assert.equal(entry.server_time, state.cooldowns.server_time);
  }
};
assert.equal((await act('activity_start', { activity_type: 'explore' })).accepted, true);
const startingState = await hooks.buildPetMiniAppState(db, id, 'test-token');
assertCareCooldowns(startingState, []);
assert.equal(bountyRouteOptions(careBounty, startingState)[0].available, true);
assert.equal(startingState.guidance.activity_options.length, 4);
assert.ok(startingState.cooldowns.entries.some((entry) => entry.key === 'timed_activity_checkpoint'));
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id=? AND event_type='activity_claim'").get(id).count, 0, 'viewing previews cannot claim a reward');
// An active background session blocks only Sleep/Train, not the daily care set.
assert.equal((await act('sleep')).reason, 'pet_busy');
assert.equal((await act('train')).reason, 'pet_busy');
for (let index = 0; index < 3; index++) {
  const care = ['feed', 'play', 'clean'];
  const before = (await hooks.buildPetGuidanceState(db, id)).missions.find((m) => m.key.includes('pet-daily-care-set'));
  assert.deepEqual(before.steps.map((step) => step.completed), care.map((_, n) => n < index));
  assert.equal((await act(care[index], { steps: care.map((key) => ({ key, completed: true })) })).accepted, true);
  const after = (await hooks.buildPetGuidanceState(db, id)).missions.find((m) => m.key.includes('pet-daily-care-set'));
  assert.deepEqual(after.steps.map((step) => step.completed), care.map((_, n) => n <= index), 'only the accepted action advances care; request steps are ignored');
  assert.equal(after.completed, index === 2);
  const actionState = await hooks.buildPetMiniAppState(db, id, 'test-token');
  assertCareCooldowns(actionState, care.slice(0, index + 1));
  assert.equal(bountyRouteOptions(careBounty, actionState)[0].available, index < 2, 'care is blocked only when all qualifying actions are cooling down or busy');
}
// Reloads rebuild state without any client-side cooldown merge or previous snapshot.
const reloadedState = await hooks.buildPetMiniAppState(db, id, 'test-token');
assertCareCooldowns(reloadedState, ['feed', 'play', 'clean']);
assert.equal(bountyRouteOptions(careBounty, reloadedState)[0].available, false);
assert.equal((await act('feed')).reason, 'cooldown');
assertCareCooldowns(await hooks.buildPetMiniAppState(db, id, 'test-token'), ['feed', 'play', 'clean']);
// Newer unaccepted events must not extend an expired care cooldown.
for (const status of ['rejected', 'pending']) {
  sqlite.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_type, event_key, season_key, day_key, status)
    SELECT ?, telegram_id, event_type, ?, season_key, day_key, ? FROM telegram_pet_events
    WHERE telegram_id=? AND event_type='feed' AND status='accepted' LIMIT 1`).run('ignored-care-' + status, 'ignored-care-' + status, status, id);
}
sqlite.prepare("UPDATE telegram_pet_events SET created_at=datetime('now','-46 seconds') WHERE telegram_id=? AND event_type='feed' AND status='accepted'").run(id);
const expiredState = await hooks.buildPetMiniAppState(db, id, 'test-token');
assertCareCooldowns(expiredState, ['play', 'clean']);
assert.equal(bountyRouteOptions(careBounty, expiredState)[0].available, true, 'an expired action makes care playable again even while Sleep/Train stay busy');
assert.equal((await act('feed')).accepted, true);
assert.equal((await act('train')).reason, 'pet_busy');
assert.equal((await hooks.buildPetGuidanceState(db, id)).missions.find((m) => m.title === 'Train once').completed, false);
sqlite.prepare('UPDATE telegram_pet_activity_sessions SET started_at=? WHERE telegram_id=?').run(new Date(now.getTime() - 7200_000).toISOString(), id);
failSettlement = true;
await assert.rejects(act('activity_claim'), /interrupted_settlement/);
const pending = await hooks.buildPetGuidanceState(db, id);
assert.equal(pending.activity?.recovery_pending, true, 'interrupted claims must stay visible to the player');
assert.equal(pending.activity.ready, true);
assert.equal(pending.activity.cooldown, null);
assert.equal(pending.activity.preview.rewards.item_key, 'adventure_map');
assert.equal(pending.activity.next_checkpoint, null, 'recovery must not promise newly accumulating rewards');
const balanceBefore = sqlite.prepare('SELECT pet_xp, moon_gold, energy FROM telegram_pet_profiles WHERE telegram_id=?').get(id);
assert.equal((await act('activity_start', { activity_type: 'sleep' })).reason, 'activity_claim_pending');
const claimed = await dispatchRenderedPetAction(db, id, { id }, { action: 'activity_claim' }, 'test-token');
assert.equal(claimed.accepted, true);
assert.deepEqual(sqlite.prepare('SELECT pet_xp, moon_gold, energy FROM telegram_pet_profiles WHERE telegram_id=?').get(id), balanceBefore, 'recovery after committed reward must never pay twice');
assert.equal((await hooks.buildPetGuidanceState(db, id)).activity, null);
assert.equal((await dispatchRenderedPetAction(db, id, { id }, { action: 'activity_claim' }, 'test-token')).accepted, false);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id=? AND event_type='activity_claim' AND status='accepted'").get(id).count, 1);
for (const action of ['sleep', 'train']) assert.equal((await act(action)).accepted, true);
assert.equal((await act('dance')).accepted, true);
const allCareState = await hooks.buildPetMiniAppState(db, id, 'test-token');
assertCareCooldowns(allCareState, careActions);
assert.equal(bountyRouteOptions(careBounty, allCareState)[0].available, false, 'all five care cooldowns also block the route without a background activity');
assert.ok(allCareState.cooldowns.entries.some((entry) => entry.key === 'action:dance' && entry.remaining_seconds > 0), 'special care cooldowns must remain in the same snapshot');
sqlite.close();
console.log('Moonpet activity options: care cooldown snapshots, bounty readiness, expiry and interrupted reward recovery passed.');

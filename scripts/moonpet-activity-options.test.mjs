import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

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
const act = (action, payload = {}) => hooks.processPetMiniAppAction(db, id, { id }, { action, ...payload }, 'test-token');
assert.equal((await act('activity_start', { activity_type: 'explore' })).accepted, true);
const startingState = await hooks.buildPetMiniAppState(db, id, 'test-token');
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
}
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
const claimed = await hooks.processPetMiniAppAction(db, id, { id }, { action: 'activity_claim' }, 'test-token');
assert.equal(claimed.accepted, true);
assert.deepEqual(sqlite.prepare('SELECT pet_xp, moon_gold, energy FROM telegram_pet_profiles WHERE telegram_id=?').get(id), balanceBefore, 'recovery after committed reward must never pay twice');
assert.equal((await hooks.buildPetGuidanceState(db, id)).activity, null);
assert.equal((await hooks.processPetMiniAppAction(db, id, { id }, { action: 'activity_claim' }, 'test-token')).accepted, false);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id=? AND event_type='activity_claim' AND status='accepted'").get(id).count, 1);
sqlite.close();
console.log('Moonpet activity options: interrupted reward visible and safely recoverable.');

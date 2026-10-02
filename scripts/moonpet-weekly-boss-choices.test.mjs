import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { PET_INSTANCE_AUTHORITY_VERSION } from '../workers/moonboys-api/pets/wallet-reconciliation.js';
import { PET_WEEKLY_BOSSES, calculatePetWeeklyBossDamage, previewPetWeeklyBossChoices } from '../workers/moonboys-api/pets/player-expansion.js';

const sqlite = new DatabaseSync(':memory:');
for (const file of ['schema.sql', 'migrations/048_telegram_pet_player_expansion.sql', 'migrations/058_telegram_pet_season_completion.sql']) {
  sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/' + file, import.meta.url), 'utf8'));
}
let beforeBatch = null, beforeFirst = null, tail = Promise.resolve();
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { if (beforeFirst) await beforeFirst(this); return sqlite.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (sqlite.prepare(this.sql).columns().length && !/\bRETURNING\b/i.test(this.sql)) return { results: sqlite.prepare(this.sql).all(...this.args), meta: { changes: 0 } };
    if (/\bRETURNING\b/i.test(this.sql)) { const results = sqlite.prepare(this.sql).all(...this.args); return { results, meta: { changes: results.length } }; }
    const result = sqlite.prepare(this.sql).run(...this.args); return { results: [], meta: { changes: Number(result.changes) } };
  }
}
const db = {
  prepare(sql) { return new Statement(sql); },
  batch(statements) {
    const task = tail.then(async () => {
      if (beforeBatch) await beforeBatch(statements);
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    tail = task.catch(() => {}); return task;
  },
};
async function seed(id, xp = 3240, energy = 80) {
  sqlite.prepare('INSERT INTO telegram_users (telegram_id, first_name, xp, level) VALUES (?, ?, 0, 1)').run(id, id);
  sqlite.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_name, pet_xp, energy, moon_gold) VALUES (?, ?, ?, ?, 100)').run(id, id, xp, energy);
  await hooks.ensurePetStarterSeasonSlot(db, id);
  const pet = await hooks.ensureActivePetInstance(db, id);
  sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json)
    VALUES (?,?,?,'young','{}','[]')`).run(pet.pet_id, id, id);
  return pet;
}
function secondPet(owner, source) {
  const id = source.pet_id + '-other';
  sqlite.prepare(`INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type)
    VALUES (?,?,?,2,'arcade_xp')`).run(id, owner, source.season_key);
  sqlite.prepare(`INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at)
    VALUES (?,?,?,2,0,30,?)`).run(id, owner, source.season_key, PET_INSTANCE_AUTHORITY_VERSION);
  sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json)
    VALUES (?,?,?,'young','{}','[]')`).run(id, owner, id);
  return id;
}
function switchTo(owner, petId) {
  sqlite.prepare('UPDATE telegram_pet_active_slots SET pet_id=? WHERE telegram_id=?').run(petId, owner);
  sqlite.prepare('UPDATE telegram_pet_profiles SET pet_xp=0,energy=30 WHERE telegram_id=?').run(owner);
}

const owner = 'weekly-boss-switch';
const original = await seed(owner), other = secondPet(owner, original);
beforeBatch = (statements) => {
  if (!statements[0].sql.includes('INSERT OR IGNORE INTO telegram_pet_weekly_boss_events')) return;
  beforeBatch = null; switchTo(owner, other);
};
const attack = await hooks.processPetWeeklyBoss(db, owner, 'strike', 'weekly-source-pet');
assert.equal(attack.accepted, true);
assert.equal(sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(original.pet_id).energy, 68,
  'Weekly Boss must charge the pet that started the attack, even if active selection changes');
assert.equal(sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(other).energy, 30);
assert.equal(sqlite.prepare("SELECT pet_id FROM telegram_pet_events WHERE telegram_id=? AND event_type='weekly_boss'").get(owner).pet_id, original.pet_id);

// The original account attempt remains replayable after switching to a level-1 pet.
const retry = await hooks.processPetWeeklyBoss(db, owner, 'endure', 'weekly-source-pet');
assert.equal(retry.accepted, true); assert.equal(retry.duplicate, true);
assert.equal(sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(other).energy, 30);
for (const action of ['strike', 'outsmart', 'endure']) {
  const id = 'weekly-preview-' + action, pet = await seed(id);
  const before = await hooks.buildPetMiniAppState(db, id, 'test-token');
  const choice = before.guidance.weekly_boss.choices.find((entry) => entry.key === action);
  const result = await dispatchRenderedPetAction(db, id, { id }, { action: 'weekly_boss', move: action, pet_id: pet.pet_id, request_id: action, damage: 999999, energy_cost: 0 }, 'test-token');
  assert.equal(result.accepted, true);
  assert.ok(result.damage >= choice.minimum_damage && result.damage <= choice.maximum_damage, 'actual damage must stay within the displayed range');
  assert.equal(sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(pet.pet_id).energy, 68);
  const after = await hooks.buildPetMiniAppState(db, id, 'test-token');
  assert.equal(after.guidance.weekly_boss.available, false);
  assert.equal(after.guidance.weekly_boss.last_attempt.damage, result.damage);
  assert.equal(after.guidance.weekly_boss.last_attempt.action, action);
  assert.ok(after.cooldowns.entries.some((entry) => entry.key === 'weekly_boss_attempt'));
  assert.equal(new Date(after.guidance.weekly_boss.rotation_cooldown.expires_at).getUTCDay(), 1);
}
for (const boss of PET_WEEKLY_BOSSES) for (const level of [5, 10, 50, 100]) for (const stage of [0, 3, 5]) for (const condition of [12, 50, 100]) {
  const input = { boss, level, evolution_stage: stage, health: condition, energy: condition, personality_ids: ['curious', 'loyal', 'street_fighter'] };
  for (const choice of previewPetWeeklyBossChoices(input)) for (let roll = 0; roll <= 12; roll++) {
    const damage = calculatePetWeeklyBossDamage({ ...input, action: choice.key, roll });
    assert.ok(damage >= choice.minimum_damage && damage <= choice.maximum_damage);
    assert.equal(choice.weakness_bonus, choice.key === boss.weakness ? 12 : 0);
    assert.equal(choice.personality_bonus, 5);
  }
}
const evolvedOwner = 'weekly-legacy-evolution', evolvedPet = await seed(evolvedOwner);
sqlite.prepare(`INSERT INTO telegram_pet_evolutions (telegram_id,evolution_id,stage,unlock_event_key,materials_consumed)
  VALUES (?,'moon_guardian',4,'weekly-evolution',1)`).run(evolvedOwner);
const evolvedPreview = (await hooks.buildPetMiniAppState(db, evolvedOwner, 'test-token')).guidance.weekly_boss.choices[0];
const evolvedAttack = await hooks.processPetWeeklyBoss(db, evolvedOwner, 'strike', 'evolved-hit', evolvedPet.pet_id);
assert.ok(evolvedAttack.damage >= evolvedPreview.minimum_damage && evolvedAttack.damage <= evolvedPreview.maximum_damage, 'valid starter-pet evolution compatibility must match its preview');
for (const change of ['energy', 'level', 'health', 'egg', 'retired']) {
  const id = 'weekly-race-' + change, pet = await seed(id);
  beforeBatch = (statements) => {
    if (!statements[0].sql.includes('INSERT OR IGNORE INTO telegram_pet_weekly_boss_events')) return;
    beforeBatch = null;
    if (change === 'egg') sqlite.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE pet_id=?").run(pet.pet_id);
    else sqlite.prepare('UPDATE telegram_pet_instances SET ' + ({ energy: 'energy=0', level: 'pet_xp=0', health: 'health=1', retired: "status='archived'" })[change] + ',source_profile_updated_at=? WHERE pet_id=?').run(PET_INSTANCE_AUTHORITY_VERSION, pet.pet_id);
  };
  const result = await hooks.processPetWeeklyBoss(db, id, 'strike', 'changed-' + change);
  assert.equal(result.accepted, false, change + ' must be rechecked within the attack transaction');
  assert.equal(result.reason, 'weekly_boss_state_changed');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_boss_events WHERE telegram_id=?').get(id).n, 0);
}
await seed('weekly-concurrent');
const simultaneous = await Promise.all(['strike', 'outsmart', 'endure'].map((move) => hooks.processPetWeeklyBoss(db, 'weekly-concurrent', move, 'concurrent-' + move)));
assert.equal(simultaneous.filter((r) => r.accepted && !r.duplicate).length, 1);
assert.equal(sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE telegram_id=?').get('weekly-concurrent').energy, 68);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_boss_events WHERE telegram_id=?').get('weekly-concurrent').n, 1);
for (const result of simultaneous) assert.equal(result.progress.attempts, 1, 'concurrent callers must see the saved boss progress');

for (const [label, matches] of [
  ['daily attempt', (sql) => sql.includes('FROM telegram_pet_weekly_boss_events WHERE telegram_id = ? AND week_key = ? AND day_key = ?')],
  ['weekly progress', (sql) => sql.includes('SELECT * FROM telegram_pet_weekly_boss_progress WHERE telegram_id = ? AND week_key = ?')],
]) {
  const id = 'weekly-read-outage-' + label.replaceAll(' ', '-');
  const pet = await seed(id);
  const energy = sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(pet.pet_id).energy;
  let hit = false;
  beforeFirst = (statement) => {
    if (matches(statement.sql)) { hit = true; throw Error('weekly_boss_authority_read_unavailable'); }
  };
  try {
    await assert.rejects(hooks.processPetWeeklyBoss(db, id, 'strike', 'weekly-read-outage'), /weekly_boss_authority_read_unavailable/);
  } finally {
    beforeFirst = null;
  }
  assert.equal(hit, true, `${label} fault must reach the authoritative read`);
  assert.equal(sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(pet.pet_id).energy, energy);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_boss_events WHERE telegram_id=?').get(id).n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE telegram_id=? AND event_type='weekly_boss'").get(id).n, 0);
}

const low = await seed('weekly-low', 0, 0);
assert.equal((await hooks.processPetWeeklyBoss(db, 'weekly-low', 'strike', 'low-level')).reason, 'boss_level_locked');
sqlite.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE pet_id=?").run(low.pet_id);
assert.equal((await hooks.processPetWeeklyBoss(db, 'weekly-low', 'strike', 'egg')).reason, 'moon_egg_must_hatch');
assert.equal((await hooks.buildPetMiniAppState(db, 'weekly-low', 'test-token')).guidance.weekly_boss.available, false);

const recoveryOwner = 'weekly-victory-recovery', winner = await seed(recoveryOwner), replacement = secondPet(recoveryOwner, winner);
const ready = (await hooks.buildPetMiniAppState(db, recoveryOwner, 'test-token')).guidance.weekly_boss;
sqlite.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts)
  VALUES (?,?,?,?,1)`).run(recoveryOwner, ready.week_key, ready.boss_id, ready.hp - 1);
beforeBatch = (statements) => {
  if (!statements[0].sql.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') || !statements[0].args.includes('pet_weekly_boss')) return;
  beforeBatch = null; throw Error('simulated reward delivery failure');
};
const victory = await hooks.processPetWeeklyBoss(db, recoveryOwner, 'strike', 'weekly-winning-hit');
assert.equal(victory.reason, 'boss_defeated');
assert.equal(victory.reward_pending, true);
const storedVictory = sqlite.prepare('SELECT * FROM telegram_pet_weekly_boss_victories_by_pet WHERE telegram_id=?').get(recoveryOwner);
assert.equal(storedVictory.pet_id, winner.pet_id, 'victory ownership must survive a failure before reward delivery');
assert.equal(storedVictory.victory_event_key, 'weekly-winning-hit');
switchTo(recoveryOwner, replacement);
sqlite.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE pet_id=?").run(replacement);
const pending = (await hooks.buildPetMiniAppState(db, recoveryOwner, 'test-token')).guidance.weekly_boss.pending_rewards;
assert.equal(pending.length, 1); assert.equal(pending[0].pet_id, winner.pet_id);
const body = { action: 'weekly_boss_claim', pet_id: winner.pet_id, week_key: ready.week_key, boss_id: ready.boss_id };
assert.equal((await hooks.claimPetWeeklyBossReward(db, recoveryOwner, { ...body, pet_id: replacement })).accepted, false);
assert.equal((await hooks.claimPetWeeklyBossReward(db, 'weekly-low', body)).accepted, false);
const recovered = await dispatchRenderedPetAction(db, recoveryOwner, { id: recoveryOwner }, body, 'test-token');
assert.equal(recovered.accepted, true, recovered.reason);
assert.equal(sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(winner.pet_id).energy, 68);
assert.equal(sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(replacement).energy, 30);
assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(recoveryOwner).moon_gold, 100 + ready.reward.moon_gold);
assert.equal(sqlite.prepare("SELECT pet_id FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_weekly_boss'").get(recoveryOwner).pet_id, winner.pet_id);
assert.equal((await dispatchRenderedPetAction(db, recoveryOwner, { id: recoveryOwner }, body, 'test-token')).duplicate, true);
assert.equal((await hooks.buildPetMiniAppState(db, recoveryOwner, 'test-token')).guidance.weekly_boss.pending_rewards.length, 0);
assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(recoveryOwner).moon_gold, 100 + ready.reward.moon_gold);

// Earlier weeks remain recoverable without inventing a current-week boss attempt.
const oldWeek = '2026-W38', oldBoss = hooks.getPetWeeklyBoss(oldWeek);
sqlite.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts,defeated_at)
  VALUES (?,?,?,?,3,'2026-09-20T12:00:00Z')`).run(recoveryOwner, oldWeek, oldBoss.boss_id, oldBoss.hp);
sqlite.prepare(`INSERT INTO telegram_pet_weekly_boss_victories_by_pet (telegram_id,week_key,boss_id,pet_id,season_key,victory_event_key,defeated_at)
  VALUES (?,?,?,?,?,?,'2026-09-20T12:00:00Z')`).run(recoveryOwner, oldWeek, oldBoss.boss_id, winner.pet_id, winner.season_key, oldWeek + ':' + oldBoss.boss_id);
const oldPending = (await hooks.buildPetMiniAppState(db, recoveryOwner, 'test-token')).guidance.weekly_boss.pending_rewards;
assert.equal(oldPending[0].week_key, oldWeek);
const careClock = sqlite.prepare('SELECT last_decay_at,last_active_day,streak_days FROM telegram_pet_instances WHERE pet_id=?').get(winner.pet_id);
assert.equal((await hooks.claimPetWeeklyBossReward(db, recoveryOwner, { pet_id: winner.pet_id, week_key: oldWeek, boss_id: oldBoss.boss_id })).accepted, true);
assert.deepEqual(sqlite.prepare('SELECT last_decay_at,last_active_day,streak_days FROM telegram_pet_instances WHERE pet_id=?').get(winner.pet_id), careClock,
  'recovering an old reward must not rewind care clocks or reset the current streak');
const oldEvent = sqlite.prepare("SELECT week_key,day_key FROM telegram_pet_events WHERE telegram_id=? AND event_type='weekly_boss_reward' AND reason=? ORDER BY created_at DESC").all(recoveryOwner, oldBoss.boss_id).find((row) => row.day_key === '2026-09-20');
assert.equal(oldEvent.week_key, oldWeek);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_boss_events WHERE telegram_id=?').get(recoveryOwner).n, 1, 'recovery must not spend a fresh attack');

sqlite.close();
console.log('Moonpet weekly boss choices and authority tests passed.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/065_moonpet_reward_pet_id_authority.sql', import.meta.url), 'utf8');
const walletReconciliationSource = fs.readFileSync(new URL('../workers/moonboys-api/pets/wallet-reconciliation.js', import.meta.url), 'utf8');
const { awardPetReward, getPetProfile, savePetProfile } = __petMediaTestHooks;

assert.match(migration, /reward_claims ADD COLUMN pet_id/);
assert.match(migration, /pet_events ADD COLUMN pet_id/);
assert.doesNotMatch(migration, /telegram_pet_profiles|CREATE\s+TRIGGER|DELETE|UPDATE/i,
  'the bounded migration must only extend reward ledgers');
assert.doesNotMatch(walletReconciliationSource, /ORDER BY[^\n]*claim_id/,
  'wallet reconciliation must not use UUID claim_id as a same-timestamp replay ordering fallback');
assert.match(walletReconciliationSource, /c\.rowid AS settlement_sequence/,
  'wallet reconciliation must expose the persisted claim row order as the durable settlement sequence');
assert.doesNotMatch(walletReconciliationSource, /current_moon_gold|current_moon_crystals|current_style_tokens|replayMissingSnapshotRowsFromTerminal/i,
  'wallet reconciliation must not infer capped wallet history from current terminal instance balances');

class Statement {
  constructor(adapter, sql, args = []) { this.adapter = adapter; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.adapter, this.sql, args); }
  async first() { return this.adapter.database.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.adapter.database.prepare(this.sql).all(...this.args) }; }
  async run() { const result = this.adapter.database.prepare(this.sql).run(...this.args); return { results: [], meta: { changes: Number(result.changes || 0) } }; }
}
class D1 {
  constructor() { this.database = new DatabaseSync(':memory:'); this.database.exec(schema); }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        const prepared = this.database.prepare(statement.sql);
        if (/\bRETURNING\b/i.test(statement.sql)) {
          const rows = prepared.all(...statement.args);
          return { results: rows, meta: { changes: rows.length } };
        }
        const result = prepared.run(...statement.args);
        return { results: [], meta: { changes: Number(result.changes || 0) } };
      });
      this.database.exec('COMMIT');
      return results;
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
}

const db = new D1();
db.database.exec("INSERT INTO telegram_seasons (name,start_date,end_date,is_active) VALUES ('Authority','2026-01-01','2027-01-01',1)");
for (const owner of ['owner', 'other', 'legacy']) {
  db.database.prepare('INSERT INTO telegram_users (telegram_id,xp,level) VALUES (?,0,1)').run(owner);
  db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold) VALUES (?,0,1,0)').run(owner);
}
function seedPet(owner, petId, slot) {
  db.database.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,'pet-s2026-003',?,'free')").run(petId, owner, slot);
  db.database.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,source_profile_updated_at) VALUES (?,?,'pet-s2026-003',?,CURRENT_TIMESTAMP)").run(petId, owner, slot);
}
const historicalWalletCursors = new Map();
function clampWalletFixture(value) {
  return Math.max(0, Math.min(999999, Math.trunc(Number(value) || 0)));
}
function completeWalletFixture(wallet = {}) {
  return {
    moon_gold: clampWalletFixture(wallet.moon_gold),
    moon_crystals: clampWalletFixture(wallet.moon_crystals),
    style_tokens: clampWalletFixture(wallet.style_tokens),
  };
}
function seedHistoricalPetIdWalletReward(owner, petId, idempotencyKey, rewards) {
  const source = 'pet_job';
  const cursorKey = `${owner}:${petId}`;
  const before = completeWalletFixture(rewards.wallet_before || rewards.wallet_start || historicalWalletCursors.get(cursorKey));
  const after = completeWalletFixture(rewards.wallet_after || {
    moon_gold: before.moon_gold + (rewards.moon_gold || 0) - (rewards.moon_gold_cost || 0),
    moon_crystals: before.moon_crystals + (rewards.moon_crystals || 0) - (rewards.moon_crystals_cost || 0),
    style_tokens: before.style_tokens + (rewards.style_tokens || 0) - (rewards.style_tokens_cost || 0),
  });
  historicalWalletCursors.set(cursorKey, after);
  const metadata = JSON.stringify({
    finalization_id: `historical-${idempotencyKey}`,
    source,
    idempotency_key: idempotencyKey,
    requested: { pet_xp: 0, community_xp: 0, moon_gold: rewards.moon_gold || 0, moon_crystals: rewards.moon_crystals || 0, style_tokens: rewards.style_tokens || 0, materials: {}, items: {}, relics: {} },
    currency_costs: { moon_gold: rewards.moon_gold_cost || 0, moon_crystals: rewards.moon_crystals_cost || 0, style_tokens: rewards.style_tokens_cost || 0 },
    profile_deltas: {},
    wallet_before: before,
    wallet_after: after,
    context: { fixture: 'pre_pr_1228_instance_wallet_reward' },
  });
  const applied = JSON.stringify({ pet_xp: 0, community_xp: 0, moon_gold: rewards.moon_gold || 0, moon_crystals: rewards.moon_crystals || 0, style_tokens: rewards.style_tokens || 0, materials: {}, items: {}, relics: {} });
  db.database.prepare(`INSERT INTO telegram_pet_reward_claims
    (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata, awarded_at)
    VALUES (?, ?, ?, ?, ?, '2026-08-16', 'awarded', ?, ?, ?, ?)`)
    .run(`claim-${idempotencyKey}`, petId, owner, source, idempotencyKey, applied, applied, metadata, rewards.awarded_at || '2026-08-16 12:00:00');
  db.database.prepare(`INSERT INTO telegram_pet_events
    (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata, created_at)
    VALUES (?, ?, ?, 'unified_reward', ?, 0, 0, 'pet-s2026-003', '2026-08-16', '2026-W33', 'accepted', 'historical_wallet_reward', ?, ?)`)
    .run(`event-${idempotencyKey}`, petId, owner, `pet_reward:${source}:${idempotencyKey}`, metadata, rewards.awarded_at || '2026-08-16 12:00:00');
}
function seedHistoricalPetIdWalletRewardWithoutSnapshot(owner, petId, idempotencyKey, rewards) {
  const source = 'pet_job';
  const metadata = JSON.stringify({
    finalization_id: `historical-${idempotencyKey}`,
    source,
    idempotency_key: idempotencyKey,
    requested: { pet_xp: 0, community_xp: 0, moon_gold: rewards.moon_gold || 0, moon_crystals: rewards.moon_crystals || 0, style_tokens: rewards.style_tokens || 0, materials: {}, items: {}, relics: {} },
    currency_costs: { moon_gold: rewards.moon_gold_cost || 0, moon_crystals: rewards.moon_crystals_cost || 0, style_tokens: rewards.style_tokens_cost || 0 },
    profile_deltas: {},
    context: { fixture: 'pre_pr_1228_instance_wallet_reward_without_snapshot' },
  });
  const applied = JSON.stringify({ pet_xp: 0, community_xp: 0, moon_gold: rewards.moon_gold || 0, moon_crystals: rewards.moon_crystals || 0, style_tokens: rewards.style_tokens || 0, materials: {}, items: {}, relics: {} });
  db.database.prepare(`INSERT INTO telegram_pet_reward_claims
    (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata, awarded_at)
    VALUES (?, ?, ?, ?, ?, '2026-08-16', 'awarded', ?, ?, ?, ?)`)
    .run(`claim-${idempotencyKey}`, petId, owner, source, idempotencyKey, applied, applied, metadata, rewards.awarded_at || '2026-08-16 12:00:00');
  db.database.prepare(`INSERT INTO telegram_pet_events
    (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata, created_at)
    VALUES (?, ?, ?, 'unified_reward', ?, 0, 0, 'pet-s2026-003', '2026-08-16', '2026-W33', 'accepted', 'historical_wallet_reward', ?, ?)`)
    .run(`event-${idempotencyKey}`, petId, owner, `pet_reward:${source}:${idempotencyKey}`, metadata, rewards.awarded_at || '2026-08-16 12:00:00');
}
seedPet('owner', 'pet-a', 1);
seedPet('owner', 'pet-b', 2);
seedPet('other', 'pet-other', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('owner','pet-a','pet-s2026-003')").run();
db.database.prepare("UPDATE telegram_pet_profiles SET updated_at='2026-08-17 12:00:00' WHERE telegram_id='owner'").run();
db.database.prepare("UPDATE telegram_pet_instances SET source_profile_updated_at='2026-08-17 12:00:00',updated_at='2026-08-17 12:00:00' WHERE pet_id='pet-a'").run();

const request = { telegram_id: 'owner', pet_id: 'pet-a', source: 'pet_job', idempotency_key: 'immutable-claim', rewards: { pet_xp: 40, moon_gold: 7, moon_crystals: 2, style_tokens: 3 }, now: '2026-08-17T12:00:00Z' };
// Switching the compatibility selector before settlement cannot redirect it.
db.database.prepare("UPDATE telegram_pet_active_slots SET pet_id='pet-b'").run();
const first = await awardPetReward(db, request);
const retry = await awardPetReward(db, request);
assert.equal(first.accepted, true, 'pet-authority reward must settle');
assert.equal(retry.duplicate, true, 'duplicate reward retry must be idempotent');
assert.deepEqual(db.database.prepare("SELECT pet_id,pet_xp,moon_gold,moon_crystals,style_tokens FROM telegram_pet_instances WHERE telegram_id='owner' ORDER BY pet_id").all().map((row) => ({ ...row })), [
  { pet_id: 'pet-a', pet_xp: 40, moon_gold: 0, moon_crystals: 0, style_tokens: 0 },
  { pet_id: 'pet-b', pet_xp: 0, moon_gold: 0, moon_crystals: 0, style_tokens: 0 },
]);
assert.deepEqual({ ...db.database.prepare("SELECT pet_xp,moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='owner'").get() },
  { pet_xp: 0, moon_gold: 7, moon_crystals: 2, style_tokens: 3 },
  'compatibility profile is the account wallet authority; pet XP remains on the participating pet');
assert.equal(db.database.prepare("SELECT updated_at FROM telegram_pet_profiles WHERE telegram_id='owner'").get().updated_at, '2026-08-17 12:00:00',
  'pet-authority wallet settlement must not bump compatibility profile updated_at for wallet-only changes');
assert.deepEqual({ ...db.database.prepare("SELECT pet_id,status FROM telegram_pet_reward_claims WHERE telegram_id='owner' AND source='pet_job'").get() }, { pet_id: 'pet-a', status: 'awarded' });
assert.deepEqual({ ...db.database.prepare("SELECT pet_id,pet_xp_awarded FROM telegram_pet_events WHERE telegram_id='owner' AND event_key='pet_reward:pet_job:immutable-claim'").get() },
  { pet_id: 'pet-a', pet_xp_awarded: 40 },
  'reward events keep the participating pet_id');
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='owner' AND source='pet_job'").get().count, 1);
const claimMetadata = JSON.parse(db.database.prepare("SELECT metadata FROM telegram_pet_reward_claims WHERE telegram_id='owner' AND source='pet_job'").get().metadata);
assert.equal(claimMetadata.idempotency_key, 'immutable-claim', 'claims must retain the full settlement metadata');
assert.deepEqual(claimMetadata.requested, { pet_xp: 40, community_xp: 0, moon_gold: 7, moon_crystals: 2, style_tokens: 3, materials: {}, items: {}, relics: {} });

// Immediate compatibility reconciliation must see the direct instance write as
// newer even when the pre-settlement profile/instance timestamps were equal.
db.database.prepare("UPDATE telegram_pet_active_slots SET pet_id='pet-a'").run();
await getPetProfile(db, 'owner');
assert.deepEqual({ ...db.database.prepare("SELECT pet_xp,moon_gold,moon_crystals,style_tokens FROM telegram_pet_instances WHERE pet_id='pet-a'").get() },
  { pet_xp: 40, moon_gold: 0, moon_crystals: 0, style_tokens: 0 }, 'profile reconciliation must not overwrite an instance-authority reward or mirror wallet state into it');
assert.equal(db.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id='owner'").get().pet_xp, 40,
  'sentinel pet-owned state must be mirrored into the compatibility profile before profile-only reward paths use it');
db.database.prepare("UPDATE telegram_pet_active_slots SET pet_id='pet-b'").run();
const petBView = await getPetProfile(db, 'owner');
assert.deepEqual({ pet_id: petBView.pet_id, pet_xp: petBView.pet_xp, moon_gold: petBView.moon_gold, moon_crystals: petBView.moon_crystals, style_tokens: petBView.style_tokens },
  { pet_id: 'pet-b', pet_xp: 0, moon_gold: 7, moon_crystals: 2, style_tokens: 3 },
  'switching active pets cannot redirect Pet XP or hide the account-owned wallet');
assert.equal(db.database.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='pet-b'").get().pet_xp, 0,
  'Pet B cannot mutate or inherit Pet A Pet XP');

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('stale-wallet-save',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,moon_crystals,style_tokens) VALUES ('stale-wallet-save',0,1,100,10,20)").run();
seedPet('stale-wallet-save', 'stale-wallet-save-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('stale-wallet-save','stale-wallet-save-a','pet-s2026-003')").run();
const staleWalletSnapshot = await getPetProfile(db, 'stale-wallet-save');
const overlappingReward = await awardPetReward(db, {
  telegram_id: 'stale-wallet-save', pet_id: 'stale-wallet-save-a', source: 'pet_job', idempotency_key: 'overlapping-wallet-reward',
  rewards: { moon_gold: 7 }, now: '2026-08-17T12:00:00Z',
});
assert.equal(overlappingReward.accepted, true, 'overlapping pet_id wallet reward must settle');
assert.equal(db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='stale-wallet-save'").get().moon_gold, 107,
  'pet_id wallet reward should atomically add to the account wallet');
await savePetProfile(db, staleWalletSnapshot);
assert.equal(db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='stale-wallet-save'").get().moon_gold, 107,
  'stale whole-profile save must not erase an overlapping wallet reward');

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('stale-wallet-spend',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,moon_crystals,style_tokens) VALUES ('stale-wallet-spend',0,1,100,10,20)").run();
seedPet('stale-wallet-spend', 'stale-wallet-spend-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('stale-wallet-spend','stale-wallet-spend-a','pet-s2026-003')").run();
const staleSpendSnapshot = await getPetProfile(db, 'stale-wallet-spend');
const overlappingSpend = await awardPetReward(db, {
  telegram_id: 'stale-wallet-spend', pet_id: 'stale-wallet-spend-a', source: 'pet_item_use', idempotency_key: 'overlapping-wallet-spend',
  rewards: {}, currency_costs: { moon_gold: 15 }, now: '2026-08-17T12:00:00Z',
});
assert.equal(overlappingSpend.accepted, true, 'overlapping pet_id wallet spend must settle');
assert.equal(db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='stale-wallet-spend'").get().moon_gold, 85,
  'pet_id wallet spend should atomically debit the account wallet');
await savePetProfile(db, staleSpendSnapshot);
assert.equal(db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='stale-wallet-spend'").get().moon_gold, 85,
  'stale whole-profile save must not undo an overlapping wallet spend');

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('legacy-bridge',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,updated_at) VALUES ('legacy-bridge',0,1,0,'2026-08-16 00:00:00')").run();
seedPet('legacy-bridge', 'legacy-bridge-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('legacy-bridge','legacy-bridge-a','pet-s2026-003')").run();
db.database.prepare("UPDATE telegram_pet_instances SET pet_xp=40, level=1, source_profile_updated_at='0001-01-01 00:00:00', updated_at='2026-08-17 00:00:00' WHERE pet_id='legacy-bridge-a'").run();
const legacyBridge = await awardPetReward(db, { telegram_id: 'legacy-bridge', source: 'pet_job', idempotency_key: 'legacy-bridge-reward', rewards: { pet_xp: 10 }, now: '2026-08-17T12:00:00Z' });
assert.equal(legacyBridge.accepted, true, 'legacy/profile reward path must still settle');
assert.equal(db.database.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='legacy-bridge-a'").get().pet_xp, 50,
  'sentinel instance Pet XP 40 plus legacy/profile reward 10 must mirror back as 50, not overwrite to 10');
assert.equal(db.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id='legacy-bridge'").get().pet_xp, 50,
  'compatibility profile must use the fresh sentinel pet-owned mirror as the legacy settlement base');

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('wallet-timestamp',0,1)").run();
db.database.prepare(`INSERT INTO telegram_pet_profiles
  (telegram_id,pet_name,species,stage,pet_xp,level,hunger,happiness,cleanliness,energy,health,streak_days,last_active_day,last_decay_at,moon_gold,moon_crystals,style_tokens,updated_at)
  VALUES ('wallet-timestamp','Moonpet','', 'egg',0,1,25,70,70,70,75,0,NULL,CURRENT_TIMESTAMP,100,10,20,'2026-08-15 01:02:03')`).run();
seedPet('wallet-timestamp', 'wallet-timestamp-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('wallet-timestamp','wallet-timestamp-a','pet-s2026-003')").run();
db.database.prepare(`UPDATE telegram_pet_instances SET
  pet_name='Moonpet', species='', stage='egg', pet_xp=0, level=1, hunger=25, happiness=70, cleanliness=70, energy=70, health=75, streak_days=0,
  moon_gold=107, moon_crystals=12, style_tokens=24, source_profile_updated_at='0001-01-01 00:00:00', updated_at='2026-08-17 00:00:00'
  WHERE pet_id='wallet-timestamp-a'`).run();
seedHistoricalPetIdWalletReward('wallet-timestamp', 'wallet-timestamp-a', 'wallet-timestamp-delta', { moon_gold: 7, moon_crystals: 2, style_tokens: 4 });
await getPetProfile(db, 'wallet-timestamp');
assert.deepEqual(
  { ...db.database.prepare("SELECT moon_gold,moon_crystals,style_tokens,updated_at FROM telegram_pet_profiles WHERE telegram_id='wallet-timestamp'").get() },
  { moon_gold: 107, moon_crystals: 12, style_tokens: 24, updated_at: '2026-08-15 01:02:03' },
  'wallet-only reconciliation must not change telegram_pet_profiles.updated_at',
);

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('legacy-wallet',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,moon_crystals,style_tokens) VALUES ('legacy-wallet',0,1,100,10,20)").run();
seedPet('legacy-wallet', 'legacy-wallet-a', 1);
seedPet('legacy-wallet', 'legacy-wallet-b', 2);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('legacy-wallet','legacy-wallet-a','pet-s2026-003')").run();
db.database.prepare(`UPDATE telegram_pet_instances SET pet_xp=88, moon_gold=107, moon_crystals=12, style_tokens=24, source_profile_updated_at='0001-01-01 00:00:00'
  WHERE pet_id='legacy-wallet-a'`).run();
db.database.prepare(`UPDATE telegram_pet_instances SET pet_xp=44, moon_gold=95, moon_crystals=8, style_tokens=19, source_profile_updated_at='0001-01-01 00:00:00'
  WHERE pet_id='legacy-wallet-b'`).run();
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=999, moon_crystals=999, style_tokens=999, source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='pet-other'").run();
seedHistoricalPetIdWalletReward('legacy-wallet', 'legacy-wallet-a', 'legacy-wallet-delta', { moon_gold: 7, moon_crystals: 2, style_tokens: 4 });
const reconciledA = await getPetProfile(db, 'legacy-wallet');
assert.deepEqual(
  { pet_id: reconciledA.pet_id, pet_xp: reconciledA.pet_xp, moon_gold: reconciledA.moon_gold, moon_crystals: reconciledA.moon_crystals, style_tokens: reconciledA.style_tokens },
  { pet_id: 'legacy-wallet-a', pet_xp: 88, moon_gold: 107, moon_crystals: 12, style_tokens: 24 },
  'pre-PR instance-only wallet deltas must stay visible through the account wallet overlay without adding the full instance balance',
);
assert.deepEqual(
  { ...db.database.prepare("SELECT pet_xp,moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='legacy-wallet'").get() },
  { pet_xp: 88, moon_gold: 107, moon_crystals: 12, style_tokens: 24 },
  'wallet reconciliation must not copy account wallet into the pet-owned instance while sentinel pet-owned fields mirror for compatibility',
);
await getPetProfile(db, 'legacy-wallet');
assert.deepEqual(
  { ...db.database.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='legacy-wallet'").get() },
  { moon_gold: 107, moon_crystals: 12, style_tokens: 24 },
  'wallet reconciliation must be idempotent under repeated reads',
);
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='legacy-wallet' AND event_key='moonpet_wallet_reconcile:v1'").get().count, 0,
  'wallet reconciliation marker must not be written into the public pet event stream');
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='legacy-wallet' AND source='wallet_reconciliation' AND idempotency_key='moonpet_wallet_reconcile:v1'").get().count, 1,
  'wallet reconciliation must have exactly one private owner marker');
db.database.prepare("UPDATE telegram_pet_active_slots SET pet_id='legacy-wallet-b' WHERE telegram_id='legacy-wallet'").run();
const reconciledB = await getPetProfile(db, 'legacy-wallet');
assert.deepEqual(
  { pet_id: reconciledB.pet_id, pet_xp: reconciledB.pet_xp, moon_gold: reconciledB.moon_gold, moon_crystals: reconciledB.moon_crystals, style_tokens: reconciledB.style_tokens },
  { pet_id: 'legacy-wallet-b', pet_xp: 44, moon_gold: 107, moon_crystals: 12, style_tokens: 24 },
  'switching active pets after reconciliation must not hide the account wallet balance',
);
assert.deepEqual(
  { ...db.database.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='other'").get() },
  { moon_gold: 0, moon_crystals: 0, style_tokens: 0 },
  'wrong-owner pet rows must not fold into another owner wallet',
);

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('legacy-slot-two-wallet',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,moon_crystals,style_tokens) VALUES ('legacy-slot-two-wallet',0,1,100,10,20)").run();
seedPet('legacy-slot-two-wallet', 'legacy-slot-two-a', 1);
seedPet('legacy-slot-two-wallet', 'legacy-slot-two-b', 2);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('legacy-slot-two-wallet','legacy-slot-two-b','pet-s2026-003')").run();
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=7, moon_crystals=2, style_tokens=4, source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='legacy-slot-two-b'").run();
seedHistoricalPetIdWalletReward('legacy-slot-two-wallet', 'legacy-slot-two-b', 'legacy-slot-two-delta', { moon_gold: 7, moon_crystals: 2, style_tokens: 4 });
await getPetProfile(db, 'legacy-slot-two-wallet');
assert.deepEqual(
  { ...db.database.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='legacy-slot-two-wallet'").get() },
  { moon_gold: 107, moon_crystals: 12, style_tokens: 24 },
  'slot-2 instance-held ledger wallet rewards must reconcile to 107/12/24 without using profile balance as a baseline',
);

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('legacy-wallet-debit',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,moon_crystals,style_tokens) VALUES ('legacy-wallet-debit',0,1,100,10,20)").run();
seedPet('legacy-wallet-debit', 'legacy-wallet-debit-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('legacy-wallet-debit','legacy-wallet-debit-a','pet-s2026-003')").run();
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=85, moon_crystals=7, style_tokens=14, source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='legacy-wallet-debit-a'").run();
seedHistoricalPetIdWalletReward('legacy-wallet-debit', 'legacy-wallet-debit-a', 'legacy-wallet-debit-delta', {
  moon_gold_cost: 15, moon_crystals_cost: 3, style_tokens_cost: 6,
  wallet_start: { moon_gold: 100, moon_crystals: 10, style_tokens: 20 },
});
await getPetProfile(db, 'legacy-wallet-debit');
assert.deepEqual(
  { ...db.database.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='legacy-wallet-debit'").get() },
  { moon_gold: 85, moon_crystals: 7, style_tokens: 14 },
  'historical pet-id wallet debits must reconcile as signed account-wallet deltas',
);

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('legacy-wallet-mixed',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,moon_crystals,style_tokens) VALUES ('legacy-wallet-mixed',0,1,100,10,20)").run();
seedPet('legacy-wallet-mixed', 'legacy-wallet-mixed-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('legacy-wallet-mixed','legacy-wallet-mixed-a','pet-s2026-003')").run();
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=102, moon_crystals=11, style_tokens=18, source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='legacy-wallet-mixed-a'").run();
seedHistoricalPetIdWalletReward('legacy-wallet-mixed', 'legacy-wallet-mixed-a', 'legacy-wallet-mixed-credit', {
  moon_gold: 20, moon_crystals: 4, style_tokens: 5,
  wallet_start: { moon_gold: 100, moon_crystals: 10, style_tokens: 20 },
});
seedHistoricalPetIdWalletReward('legacy-wallet-mixed', 'legacy-wallet-mixed-a', 'legacy-wallet-mixed-debit', {
  moon_gold_cost: 18, moon_crystals_cost: 3, style_tokens_cost: 7,
});
await getPetProfile(db, 'legacy-wallet-mixed');
assert.deepEqual(
  { ...db.database.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='legacy-wallet-mixed'").get() },
  { moon_gold: 102, moon_crystals: 11, style_tokens: 18 },
  'mixed historical wallet credits and debits must reconcile to the signed net amount',
);

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('legacy-wallet-capped',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,moon_crystals,style_tokens) VALUES ('legacy-wallet-capped',0,1,999990,10,20)").run();
seedPet('legacy-wallet-capped', 'legacy-wallet-capped-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('legacy-wallet-capped','legacy-wallet-capped-a','pet-s2026-003')").run();
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=999994, moon_crystals=10, style_tokens=20, source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='legacy-wallet-capped-a'").run();
seedHistoricalPetIdWalletReward('legacy-wallet-capped', 'legacy-wallet-capped-a', 'legacy-wallet-capped-credit', {
  moon_gold: 20,
  wallet_before: { moon_gold: 999990, moon_crystals: 10, style_tokens: 20 },
  wallet_after: { moon_gold: 999999, moon_crystals: 10, style_tokens: 20 },
  awarded_at: '2026-08-16 12:00:00',
});
seedHistoricalPetIdWalletReward('legacy-wallet-capped', 'legacy-wallet-capped-a', 'legacy-wallet-capped-debit', {
  moon_gold_cost: 5,
  wallet_before: { moon_gold: 999999, moon_crystals: 10, style_tokens: 20 },
  wallet_after: { moon_gold: 999994, moon_crystals: 10, style_tokens: 20 },
  awarded_at: '2026-08-16 12:00:01',
});
await getPetProfile(db, 'legacy-wallet-capped');
assert.deepEqual(
  { ...db.database.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='legacy-wallet-capped'").get() },
  { moon_gold: 999994, moon_crystals: 10, style_tokens: 20 },
  'capped historical wallet transitions must replay per event instead of using raw aggregate reward-minus-cost totals',
);

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('legacy-wallet-same-time',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,moon_crystals,style_tokens) VALUES ('legacy-wallet-same-time',0,1,100,10,20)").run();
seedPet('legacy-wallet-same-time', 'legacy-wallet-same-time-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('legacy-wallet-same-time','legacy-wallet-same-time-a','pet-s2026-003')").run();
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=115, moon_crystals=10, style_tokens=20, source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='legacy-wallet-same-time-a'").run();
seedHistoricalPetIdWalletReward('legacy-wallet-same-time', 'legacy-wallet-same-time-a', 'same-time-zz-credit', {
  moon_gold: 20,
  wallet_start: { moon_gold: 100, moon_crystals: 10, style_tokens: 20 },
  awarded_at: '2026-08-16 12:00:00',
});
seedHistoricalPetIdWalletReward('legacy-wallet-same-time', 'legacy-wallet-same-time-a', 'same-time-aa-debit', {
  moon_gold_cost: 5,
  awarded_at: '2026-08-16 12:00:00',
});
await getPetProfile(db, 'legacy-wallet-same-time');
assert.deepEqual(
  { ...db.database.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='legacy-wallet-same-time'").get() },
  { moon_gold: 115, moon_crystals: 10, style_tokens: 20 },
  'same-timestamp historical wallet transitions must chain by wallet snapshots instead of UUID claim ordering',
);

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('legacy-wallet-mirror-damaged',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,moon_crystals,style_tokens) VALUES ('legacy-wallet-mirror-damaged',0,1,100,10,20)").run();
seedPet('legacy-wallet-mirror-damaged', 'legacy-wallet-mirror-damaged-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('legacy-wallet-mirror-damaged','legacy-wallet-mirror-damaged-a','pet-s2026-003')").run();
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=0, moon_crystals=0, style_tokens=0, source_profile_updated_at='2026-08-17 00:00:00' WHERE pet_id='legacy-wallet-mirror-damaged-a'").run();
seedHistoricalPetIdWalletReward('legacy-wallet-mirror-damaged', 'legacy-wallet-mirror-damaged-a', 'mirror-damaged-delta', {
  moon_gold: 7, moon_crystals: 2, style_tokens: 4,
  wallet_start: { moon_gold: 0, moon_crystals: 0, style_tokens: 0 },
});
await getPetProfile(db, 'legacy-wallet-mirror-damaged');
assert.deepEqual(
  { ...db.database.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='legacy-wallet-mirror-damaged'").get() },
  { moon_gold: 107, moon_crystals: 12, style_tokens: 24 },
  'historical wallet reconciliation must recover from ledger snapshots even if an old mirror cleared the sentinel timestamp or instance wallet cache',
);

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('legacy-wallet-instance-missing',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,moon_crystals,style_tokens) VALUES ('legacy-wallet-instance-missing',0,1,100,10,20)").run();
seedPet('legacy-wallet-instance-missing', 'legacy-wallet-instance-missing-active', 1);
seedPet('legacy-wallet-instance-missing', 'legacy-wallet-instance-missing-old', 2);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('legacy-wallet-instance-missing','legacy-wallet-instance-missing-active','pet-s2026-003')").run();
seedHistoricalPetIdWalletReward('legacy-wallet-instance-missing', 'legacy-wallet-instance-missing-old', 'instance-missing-delta', {
  moon_gold: 7, moon_crystals: 2, style_tokens: 4,
  wallet_start: { moon_gold: 0, moon_crystals: 0, style_tokens: 0 },
});
db.database.prepare("DELETE FROM telegram_pet_instances WHERE pet_id='legacy-wallet-instance-missing-old'").run();
await getPetProfile(db, 'legacy-wallet-instance-missing');
assert.deepEqual(
  { ...db.database.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='legacy-wallet-instance-missing'").get() },
  { moon_gold: 107, moon_crystals: 12, style_tokens: 24 },
  'historical wallet reconciliation must use claim/event ledger snapshots even when current instance metadata is unavailable',
);

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('legacy-wallet-no-snapshot',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,moon_crystals,style_tokens) VALUES ('legacy-wallet-no-snapshot',0,1,100,10,20)").run();
seedPet('legacy-wallet-no-snapshot', 'legacy-wallet-no-snapshot-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('legacy-wallet-no-snapshot','legacy-wallet-no-snapshot-a','pet-s2026-003')").run();
seedHistoricalPetIdWalletRewardWithoutSnapshot('legacy-wallet-no-snapshot', 'legacy-wallet-no-snapshot-a', 'no-snapshot-credit', { moon_gold: 7, moon_crystals: 2, style_tokens: 4 });
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=7, moon_crystals=2, style_tokens=4, source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='legacy-wallet-no-snapshot-a'").run();
await assert.rejects(() => getPetProfile(db, 'legacy-wallet-no-snapshot'), /moonpet_wallet_reconciliation_missing_wallet_snapshot/);
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='legacy-wallet-no-snapshot' AND source='wallet_reconciliation' AND idempotency_key='moonpet_wallet_reconcile:v1'").get().count, 0,
  'older claims without wallet snapshots must fail closed instead of inferring capped history from terminal balances');
assert.deepEqual(
  { ...db.database.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='legacy-wallet-no-snapshot'").get() },
  { moon_gold: 100, moon_crystals: 10, style_tokens: 20 },
  'no-snapshot historical rows must leave the account wallet unchanged when the final wallet state cannot be proven',
);

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('legacy-inactive-wallet',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold,moon_crystals,style_tokens) VALUES ('legacy-inactive-wallet',0,1,50,5,5)").run();
seedPet('legacy-inactive-wallet', 'legacy-inactive-a', 1);
seedPet('legacy-inactive-wallet', 'legacy-inactive-b', 2);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('legacy-inactive-wallet','legacy-inactive-a','pet-s2026-003')").run();
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=54, moon_crystals=7, style_tokens=5, status='archived', source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='legacy-inactive-a'").run();
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=56, moon_crystals=5, style_tokens=8, status='retired', source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='legacy-inactive-b'").run();
seedHistoricalPetIdWalletReward('legacy-inactive-wallet', 'legacy-inactive-a', 'legacy-inactive-archived-delta', { moon_gold: 4, moon_crystals: 2, style_tokens: 0 });
seedHistoricalPetIdWalletReward('legacy-inactive-wallet', 'legacy-inactive-b', 'legacy-inactive-retired-delta', { moon_gold: 6, moon_crystals: 0, style_tokens: 3 });
await getPetProfile(db, 'legacy-inactive-wallet');
assert.deepEqual(
  { ...db.database.prepare("SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id='legacy-inactive-wallet'").get() },
  { moon_gold: 60, moon_crystals: 7, style_tokens: 8 },
  'archived and retired sentinel instances must be included in one-shot wallet reconciliation',
);

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('failed-reconcile',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold) VALUES ('failed-reconcile',0,1,100)").run();
seedPet('failed-reconcile', 'failed-reconcile-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('failed-reconcile','failed-reconcile-a','pet-s2026-003')").run();
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=107, source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='failed-reconcile-a'").run();
seedHistoricalPetIdWalletReward('failed-reconcile', 'failed-reconcile-a', 'failed-reconcile-delta', { moon_gold: 7 });
const failingReconcileDb = {
  database: db.database,
  prepare(sql) { return db.prepare(sql); },
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      await statements[0].run();
      throw new Error('simulated_reconcile_failure');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  },
};
await assert.rejects(() => getPetProfile(failingReconcileDb, 'failed-reconcile'), /simulated_reconcile_failure/);
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id='failed-reconcile' AND event_key='moonpet_wallet_reconcile:v1'").get().count, 0,
  'one-shot reconciliation marker must not commit to public events when wallet reconciliation cannot safely complete');
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='failed-reconcile' AND source='wallet_reconciliation' AND idempotency_key='moonpet_wallet_reconcile:v1'").get().count, 0,
  'one-shot private reconciliation marker must not commit when wallet reconciliation cannot safely complete');
assert.equal(db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='failed-reconcile'").get().moon_gold, 100,
  'failed reconciliation must leave the account wallet unchanged for retry');

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('ambiguous-reconcile',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold) VALUES ('ambiguous-reconcile',0,1,100)").run();
seedPet('ambiguous-reconcile', 'ambiguous-reconcile-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('ambiguous-reconcile','ambiguous-reconcile-a','pet-s2026-003')").run();
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=107, source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='ambiguous-reconcile-a'").run();
db.database.prepare(`INSERT INTO telegram_pet_reward_claims
  (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata, awarded_at)
  VALUES ('claim-ambiguous-reconcile', 'ambiguous-reconcile-a', 'ambiguous-reconcile', 'pet_job', 'ambiguous-reconcile-delta', '2026-08-16', 'awarded', '{}', '{"moon_gold":7}', '{"broken":', '2026-08-16 12:00:00')`).run();
await assert.rejects(() => getPetProfile(db, 'ambiguous-reconcile'), /moonpet_wallet_reconciliation_ambiguous_ledger/);
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='ambiguous-reconcile' AND source='wallet_reconciliation' AND idempotency_key='moonpet_wallet_reconcile:v1'").get().count, 0,
  'ambiguous historical ledger data must fail safe without committing the reconciliation marker');

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('missing-snapshot-reconcile',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold) VALUES ('missing-snapshot-reconcile',0,1,100)").run();
seedPet('missing-snapshot-reconcile', 'missing-snapshot-reconcile-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('missing-snapshot-reconcile','missing-snapshot-reconcile-a','pet-s2026-003')").run();
const missingSnapshotMetadata = JSON.stringify({
  finalization_id: 'missing-snapshot-reconcile',
  source: 'pet_job',
  idempotency_key: 'missing-snapshot-reconcile-delta',
  requested: { moon_gold: 7 },
  currency_costs: {},
});
db.database.prepare(`INSERT INTO telegram_pet_reward_claims
  (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata, awarded_at)
  VALUES ('claim-missing-snapshot-reconcile', 'missing-snapshot-reconcile-a', 'missing-snapshot-reconcile', 'pet_job', 'missing-snapshot-reconcile-delta', '2026-08-16', 'awarded', '{"moon_gold":7}', '{"moon_gold":7}', ?, '2026-08-16 12:00:00')`).run(missingSnapshotMetadata);
db.database.prepare(`INSERT INTO telegram_pet_events
  (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata, created_at)
  VALUES ('event-missing-snapshot-reconcile', 'missing-snapshot-reconcile-a', 'missing-snapshot-reconcile', 'unified_reward', 'pet_reward:pet_job:missing-snapshot-reconcile-delta', 0, 0, 'pet-s2026-003', '2026-08-16', '2026-W33', 'accepted', 'historical_wallet_reward', ?, '2026-08-16 12:00:00')`).run(missingSnapshotMetadata);
await assert.rejects(() => getPetProfile(db, 'missing-snapshot-reconcile'), /moonpet_wallet_reconciliation_missing_wallet_snapshot/);
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='missing-snapshot-reconcile' AND source='wallet_reconciliation' AND idempotency_key='moonpet_wallet_reconcile:v1'").get().count, 0,
  'missing historical wallet snapshots must fail closed without committing the reconciliation marker');
assert.equal(db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='missing-snapshot-reconcile'").get().moon_gold, 100,
  'missing-snapshot history must leave the account wallet unchanged');

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('missing-snapshot-capped',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold) VALUES ('missing-snapshot-capped',0,1,100)").run();
seedPet('missing-snapshot-capped', 'missing-snapshot-capped-a', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('missing-snapshot-capped','missing-snapshot-capped-a','pet-s2026-003')").run();
seedHistoricalPetIdWalletRewardWithoutSnapshot('missing-snapshot-capped', 'missing-snapshot-capped-a', 'missing-snapshot-capped-delta', { moon_gold: 20 });
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=999999, source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='missing-snapshot-capped-a'").run();
await assert.rejects(() => getPetProfile(db, 'missing-snapshot-capped'), /moonpet_wallet_reconciliation_missing_wallet_snapshot/);
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='missing-snapshot-capped' AND source='wallet_reconciliation' AND idempotency_key='moonpet_wallet_reconcile:v1'").get().count, 0,
  'missing historical wallet snapshots at a cap boundary must fail closed without committing the reconciliation marker');
assert.equal(db.database.prepare("SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id='missing-snapshot-capped'").get().moon_gold, 100,
  'ambiguous capped missing-snapshot history must leave the account wallet unchanged');

for (const [owner, column, value] of [
  ['malformed-null-reconcile', 'applied_rewards', 'null'],
  ['malformed-array-reconcile', 'requested_rewards', '[]'],
  ['malformed-scalar-reconcile', 'metadata', '"scalar"'],
]) {
  db.database.prepare('INSERT INTO telegram_users (telegram_id,xp,level) VALUES (?,0,1)').run(owner);
  db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold) VALUES (?,0,1,100)').run(owner);
  seedPet(owner, `${owner}-a`, 1);
  db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?, 'pet-s2026-003')").run(owner, `${owner}-a`);
  const objectMetadata = JSON.stringify({
    finalization_id: owner,
    source: 'pet_job',
    idempotency_key: `${owner}-delta`,
    requested: { moon_gold: 7 },
    currency_costs: {},
    wallet_before: { moon_gold: 100, moon_crystals: 0, style_tokens: 0 },
    wallet_after: { moon_gold: 107, moon_crystals: 0, style_tokens: 0 },
  });
  const requestedRewards = column === 'requested_rewards' ? value : '{"moon_gold":7}';
  const appliedRewards = column === 'applied_rewards' ? value : '{"moon_gold":7}';
  const metadata = column === 'metadata' ? value : objectMetadata;
  db.database.prepare(`INSERT INTO telegram_pet_reward_claims
    (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata, awarded_at)
    VALUES (?, ?, ?, 'pet_job', ?, '2026-08-16', 'awarded', ?, ?, ?, '2026-08-16 12:00:00')`)
    .run(`claim-${owner}`, `${owner}-a`, owner, `${owner}-delta`, requestedRewards, appliedRewards, metadata);
  db.database.prepare(`INSERT INTO telegram_pet_events
    (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata, created_at)
    VALUES (?, ?, ?, 'unified_reward', ?, 0, 0, 'pet-s2026-003', '2026-08-16', '2026-W33', 'accepted', 'historical_wallet_reward', ?, '2026-08-16 12:00:00')`)
    .run(`event-${owner}`, `${owner}-a`, owner, `pet_reward:pet_job:${owner}-delta`, metadata);
  await assert.rejects(() => getPetProfile(db, owner), /moonpet_wallet_reconciliation_ambiguous_ledger/,
    `${column} ${value} must fail closed as malformed wallet history`);
  assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='wallet_reconciliation' AND idempotency_key='moonpet_wallet_reconcile:v1'").get(owner).count, 0,
    `${column} ${value} must not commit the reconciliation marker`);
  assert.equal(db.database.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(owner).moon_gold, 100,
    `${column} ${value} must leave the account wallet unchanged`);
}

const wrongOwner = await awardPetReward(db, { ...request, pet_id: 'pet-other', idempotency_key: 'wrong-owner' });
assert.equal(wrongOwner.accepted, false, 'a persisted pet owned by another player must fail closed');
assert.equal(db.database.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='pet-other'").get().pet_xp, 0);

const legacy = await awardPetReward(db, { telegram_id: 'legacy', source: 'pet_job', idempotency_key: 'pre-cutover', rewards: { pet_xp: 11 } });
assert.equal(legacy.accepted, true, 'reward rows without pet_id retain legacy settlement');
assert.equal(db.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id='legacy'").get().pet_xp, 11);
assert.equal(db.database.prepare("SELECT pet_id FROM telegram_pet_reward_claims WHERE telegram_id='legacy'").get().pet_id, null);

db.database.prepare("INSERT INTO telegram_users (telegram_id,xp,level) VALUES ('legacy-spend',0,1)").run();
db.database.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level,moon_gold) VALUES ('legacy-spend',0,1,0)").run();
seedPet('legacy-spend', 'legacy-spend-a', 1);
db.database.prepare("UPDATE telegram_pet_instances SET moon_gold=20, source_profile_updated_at='0001-01-01 00:00:00' WHERE pet_id='legacy-spend-a'").run();
seedHistoricalPetIdWalletReward('legacy-spend', 'legacy-spend-a', 'legacy-spend-delta', { moon_gold: 20 });
const spendAfterReconcile = await awardPetReward(db, {
  telegram_id: 'legacy-spend', pet_id: 'legacy-spend-a', source: 'pet_item_use', idempotency_key: 'spend-reconciled-wallet',
  rewards: { pet_xp: 3 }, currency_costs: { moon_gold: 15 }, now: '2026-08-17T12:00:00Z',
});
assert.equal(spendAfterReconcile.accepted, true, 'reward settlement must reconcile historical instance wallet before spending checks');
assert.deepEqual({ ...db.database.prepare("SELECT pet_xp,moon_gold FROM telegram_pet_instances WHERE pet_id='legacy-spend-a'").get() },
  { pet_xp: 3, moon_gold: 20 }, 'spending reconciliation must not move Pet XP or mutate the legacy instance wallet cache');
assert.deepEqual({ ...db.database.prepare("SELECT pet_xp,moon_gold FROM telegram_pet_profiles WHERE telegram_id='legacy-spend'").get() },
  { pet_xp: 0, moon_gold: 5 }, 'spending must debit the reconciled account wallet authority');

// A reservation event exists before its reward claim. Settlement must attach
// the immutable pet and include that award in the same pet's daily cap.
db.database.prepare('INSERT INTO telegram_users (telegram_id,xp,level) VALUES (?,0,1)').run('reserved');
db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,level) VALUES (?,0,1)').run('reserved');
seedPet('reserved', 'pet-reserved', 1);
db.database.prepare(`INSERT INTO telegram_pet_events
  (id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,reason)
  VALUES ('reservation-1','reserved','reserved_reward','reservation-1','pet-s2026-003','2026-08-17','2026-W34','pending','reserved')`).run();
const reserved = await awardPetReward(db, {
  telegram_id: 'reserved', pet_id: 'pet-reserved', source: 'pet_job', idempotency_key: 'reservation-claim',
  reservation_id: 'reservation-1', day_key: '2026-08-17', week_key: '2026-W34', season_key: 'pet-s2026-003',
  rewards: { pet_xp: 1190 }, now: '2026-08-17T12:00:00Z',
});
assert.equal(reserved.pet_xp_awarded, 1190);
assert.equal(db.database.prepare("SELECT pet_id FROM telegram_pet_events WHERE id='reservation-1'").get().pet_id, 'pet-reserved');
const capped = await awardPetReward(db, {
  telegram_id: 'reserved', pet_id: 'pet-reserved', source: 'pet_job', idempotency_key: 'after-reservation',
  rewards: { pet_xp: 20 }, now: '2026-08-17T12:01:00Z',
});
assert.equal(capped.pet_xp_awarded, 10, 'reservation settlement must count toward the immutable pet daily cap');
assert.equal(db.database.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='pet-reserved'").get().pet_xp, 1200);

console.log('Moonpet pet_id reward authority tests passed.');

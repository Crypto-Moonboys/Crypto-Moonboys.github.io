import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/065_moonpet_reward_pet_id_authority.sql', import.meta.url), 'utf8');
const { awardPetReward, getPetProfile } = __petMediaTestHooks;

assert.match(migration, /reward_claims ADD COLUMN pet_id/);
assert.match(migration, /pet_events ADD COLUMN pet_id/);
assert.doesNotMatch(migration, /telegram_pet_profiles|CREATE\s+TRIGGER|DELETE|UPDATE/i,
  'the bounded migration must only extend reward ledgers');

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
seedPet('owner', 'pet-a', 1);
seedPet('owner', 'pet-b', 2);
seedPet('other', 'pet-other', 1);
db.database.prepare("INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES ('owner','pet-a','pet-s2026-003')").run();
db.database.prepare("UPDATE telegram_pet_profiles SET updated_at='2026-08-17 12:00:00' WHERE telegram_id='owner'").run();
db.database.prepare("UPDATE telegram_pet_instances SET source_profile_updated_at='2026-08-17 12:00:00',updated_at='2026-08-17 12:00:00' WHERE pet_id='pet-a'").run();

const request = { telegram_id: 'owner', pet_id: 'pet-a', source: 'pet_job', idempotency_key: 'immutable-claim', rewards: { pet_xp: 40, moon_gold: 7 }, now: '2026-08-17T12:00:00Z' };
// Switching the compatibility selector before settlement cannot redirect it.
db.database.prepare("UPDATE telegram_pet_active_slots SET pet_id='pet-b'").run();
const first = await awardPetReward(db, request);
const retry = await awardPetReward(db, request);
assert.equal(first.accepted, true, 'pet-authority reward must settle');
assert.equal(retry.duplicate, true, 'duplicate reward retry must be idempotent');
assert.deepEqual(db.database.prepare("SELECT pet_id,pet_xp,moon_gold FROM telegram_pet_instances WHERE telegram_id='owner' ORDER BY pet_id").all().map((row) => ({ ...row })), [
  { pet_id: 'pet-a', pet_xp: 40, moon_gold: 7 },
  { pet_id: 'pet-b', pet_xp: 0, moon_gold: 0 },
]);
assert.equal(db.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id='owner'").get().pet_xp, 0,
  'compatibility profile must remain read-only for pet-authority settlement');
assert.deepEqual({ ...db.database.prepare("SELECT pet_id,status FROM telegram_pet_reward_claims WHERE telegram_id='owner'").get() }, { pet_id: 'pet-a', status: 'awarded' });
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_reward_claims WHERE telegram_id='owner'").get().count, 1);
const claimMetadata = JSON.parse(db.database.prepare("SELECT metadata FROM telegram_pet_reward_claims WHERE telegram_id='owner'").get().metadata);
assert.equal(claimMetadata.idempotency_key, 'immutable-claim', 'claims must retain the full settlement metadata');
assert.deepEqual(claimMetadata.requested, { pet_xp: 40, community_xp: 0, moon_gold: 7, moon_crystals: 0, style_tokens: 0, materials: {}, items: {}, relics: {} });

// Immediate compatibility reconciliation must see the direct instance write as
// newer even when the pre-settlement profile/instance timestamps were equal.
db.database.prepare("UPDATE telegram_pet_active_slots SET pet_id='pet-a'").run();
await getPetProfile(db, 'owner');
assert.deepEqual({ ...db.database.prepare("SELECT pet_xp,moon_gold FROM telegram_pet_instances WHERE pet_id='pet-a'").get() },
  { pet_xp: 40, moon_gold: 7 }, 'profile reconciliation must not overwrite an instance-authority reward');

const wrongOwner = await awardPetReward(db, { ...request, pet_id: 'pet-other', idempotency_key: 'wrong-owner' });
assert.equal(wrongOwner.accepted, false, 'a persisted pet owned by another player must fail closed');
assert.equal(db.database.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='pet-other'").get().pet_xp, 0);

const legacy = await awardPetReward(db, { telegram_id: 'legacy', source: 'pet_job', idempotency_key: 'pre-cutover', rewards: { pet_xp: 11 } });
assert.equal(legacy.accepted, true, 'reward rows without pet_id retain legacy settlement');
assert.equal(db.database.prepare("SELECT pet_xp FROM telegram_pet_profiles WHERE telegram_id='legacy'").get().pet_xp, 11);
assert.equal(db.database.prepare("SELECT pet_id FROM telegram_pet_reward_claims WHERE telegram_id='legacy'").get().pet_id, null);

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

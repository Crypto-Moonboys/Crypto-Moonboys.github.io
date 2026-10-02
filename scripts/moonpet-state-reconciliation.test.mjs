import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of ['schema.sql', 'migrations/048_telegram_pet_player_expansion.sql', 'migrations/058_telegram_pet_season_completion.sql', 'migrations/061_moonpet_season_economy_calibration.sql']) {
    sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/' + file, import.meta.url), 'utf8'));
  }
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() {
      if (db.failRead?.test(this.query)) { db.failRead = null; throw new Error('pet_state_read_unavailable'); }
      return sql.prepare(this.query).get(...this.args) || null;
    }
    async all() {
      if (db.failRead?.test(this.query)) { db.failRead = null; throw new Error('pet_state_read_unavailable'); }
      return { results: sql.prepare(this.query).all(...this.args) };
    }
    execute() {
      const statement = sql.prepare(this.query);
      if (statement.columns().length) {
        const results = statement.all(...this.args);
        return { results, meta: { changes: /\bRETURNING\b/i.test(this.query) ? results.length : 0 } };
      }
      return { results: [], meta: { changes: Number(statement.run(...this.args).changes) } };
    }
    async run() {
      if (db.beforeWrite) await db.beforeWrite([this]);
      const result = this.execute();
      if (db.afterWrite) await db.afterWrite([this]);
      return result;
    }
  }
  const db = {
    beforeWrite: null,
    afterWrite: null,
    failRead: null,
    prepare(query) { return new Statement(query); },
    async batch(statements) {
      if (this.beforeWrite) await this.beforeWrite(statements);
      sql.exec('BEGIN');
      let results;
      try {
        results = statements.map(statement => statement.execute());
        sql.exec('COMMIT');
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
      if (this.afterWrite) await this.afterWrite(statements);
      return results;
    },
  };
  const instance = petId => sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(petId);
  const profile = () => sql.prepare('SELECT * FROM telegram_pet_profiles WHERE telegram_id=?').get(owner);
  const active = () => sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(owner).pet_id;
  const award = (petId, amount, key) => hooks.awardPetReward(db, {
    telegram_id: owner, pet_id: petId, season_key: instance(petId).season_key, source: 'pet_action',
    idempotency_key: key, event_key: key, rewards: { pet_xp: amount }, context: {},
  });
  const before = (matches, callback) => {
    let ran = false;
    db.beforeWrite = async statements => {
      if (!statements.some(matches)) return;
      db.beforeWrite = null;
      ran = true;
      await callback();
    };
    return () => assert.equal(ran, true, 'the concurrent write must occur at the intended boundary');
  };
  return { owner, db, sql, instance, profile, active, award, before };
}

async function adoptedPlayer(owner) {
  const f = fixture(owner);
  f.sql.prepare('INSERT INTO telegram_users(telegram_id) VALUES (?)').run(owner);
  f.sql.prepare('INSERT INTO arcade_progression_state(telegram_id,arcade_xp_total) VALUES (?,5000)').run(owner);
  f.sql.prepare('INSERT INTO arcade_xp_wallets(telegram_id,arcade_xp_earned,arcade_xp_spendable) VALUES (?,5000,5000)').run(owner);
  assert.equal((await hooks.processPetAction(f.db, owner, 'adopt', { event_key: owner + ':adopt' })).accepted, true);
  f.a = f.active();
  return f;
}

async function ownedPets(owner) {
  const f = await adoptedPlayer(owner);
  assert.equal((await hooks.buyPetSeasonSlot(f.db, owner, 2)).accepted, true);
  f.b = f.sql.prepare("SELECT pet_id FROM telegram_pet_season_slots WHERE telegram_id=? AND acquisition_type='arcade_xp' AND status='active'").get(owner).pet_id;
  assert.equal((await f.award(f.a, 200, owner + ':A')).accepted, true);
  assert.equal((await f.award(f.b, 300, owner + ':B')).accepted, true);
  await hooks.getPetProfile(f.db, owner);
  return f;
}

test('a stale profile mirror reloads the selected pet without copying another pet state', async () => {
  const f = await ownedPets('mirror-switch');
  assert.equal((await f.award(f.a, 20, 'mirror-switch:late-A')).accepted, true);
  const raced = f.before(s => /UPDATE telegram_pet_profiles SET/.test(s.query), async () => {
    const switched = await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.b);
    assert.equal(switched.accepted, true);
    assert.equal(switched.pet.pet_xp, 300);
  });
  const result = await hooks.getPetProfile(f.db, f.owner);
  raced();
  assert.equal(result.pet_id, f.b);
  assert.equal(result.pet_xp, 300);
  assert.equal(f.instance(f.a).pet_xp, 220);
  assert.equal(f.instance(f.b).pet_xp, 300);
  assert.equal(f.profile().pet_xp, 300);
});

test('a saved pet switch stays accepted when its post-commit profile read fails', async () => {
  const f = await ownedPets('switch-projection-outage');
  f.db.afterWrite = async statements => {
    if (!statements.some(s => /UPDATE telegram_pet_active_slots SET pet_id=/.test(s.query))) return;
    f.db.afterWrite = null;
    f.db.failRead = /SELECT \* FROM telegram_pet_profiles/;
  };
  const result = await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.b);
  assert.equal(result.accepted, true);
  assert.equal(result.refresh_state, true);
  assert.equal(result.reason, 'pet_slot_switched');
  assert.equal(f.active(), f.b);
  assert.equal(f.profile().pet_xp, 300);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.b)).accepted, true);
  assert.equal(f.instance(f.b).pet_xp, 300);
});

test('saved deletion retains its confirmation and history result when roster projection fails', async () => {
  const f = await ownedPets('deletion-projection-outage');
  f.db.afterWrite = async statements => {
    if (!statements.some(s => /UPDATE telegram_pet_instances SET status='archived'/.test(s.query))) return;
    f.db.afterWrite = null;
    f.db.failRead = /FROM telegram_pet_season_slots s/;
  };
  const confirmation = { pet_id: f.b, confirm_pet_id: f.b, confirmed: true };
  const result = await hooks.deletePetSlot(f.db, f.owner, confirmation);
  assert.equal(result.accepted, true);
  assert.equal(result.refresh_state, true);
  assert.equal(result.reward_history_preserved, true);
  assert.equal(f.instance(f.b).status, 'archived');
  assert.equal(f.active(), f.a);
  assert.equal((await hooks.deletePetSlot(f.db, f.owner, confirmation)).accepted, false);
});

for (const switchActive of [false, true]) test(`paid purchase survives its ${switchActive ? 'optional switch' : 'first instance read'} projection failure without another charge`, async () => {
  const f = await adoptedPlayer('purchase-projection-' + switchActive);
  const wallet = () => f.sql.prepare('SELECT arcade_xp_spendable,arcade_xp_spent FROM arcade_xp_wallets WHERE telegram_id=?').get(f.owner);
  const before = wallet();
  f.db.afterWrite = async statements => {
    if (!statements.some(s => /UPDATE arcade_xp_wallets SET arcade_xp_spendable=arcade_xp_spendable-/.test(s.query))) return;
    f.db.afterWrite = null;
    f.db.failRead = switchActive
      ? /SELECT s.pet_id, s.season_key FROM telegram_pet_season_slots s/
      : /SELECT pet_id FROM telegram_pet_instances WHERE pet_id=/;
  };
  const result = await hooks.buyPetSeasonSlot(f.db, f.owner, 2, { switch_active: switchActive });
  assert.equal(result.accepted, true);
  assert.equal(result.refresh_state, true);
  assert.equal(result.reason, 'pet_slot_purchased');
  assert.equal(wallet().arcade_xp_spendable, before.arcade_xp_spendable - 500);
  assert.equal(wallet().arcade_xp_spent, before.arcade_xp_spent + 500);
  assert.equal(f.active(), f.a);
  assert.equal((await hooks.buyPetSeasonSlot(f.db, f.owner, 2)).reason, 'pet_slot_already_owned');
  assert.equal(wallet().arcade_xp_spendable, before.arcade_xp_spendable - 500);
});

test('legacy profile reconciliation keeps the original source when selection changes before its write', async () => {
  const f = await ownedPets('legacy-mirror-switch');
  await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.b);
  await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.a);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=260,level=3 WHERE telegram_id=?').run(f.owner);
  const raced = f.before(s => /UPDATE telegram_pet_instances SET pet_name =/.test(s.query), async () => {
    assert.equal((await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.b)).accepted, true);
  });
  const result = await hooks.getPetProfile(f.db, f.owner);
  raced();
  assert.equal(result.pet_id, f.b);
  assert.equal(f.instance(f.a).pet_xp, 260);
  assert.equal(f.instance(f.b).pet_xp, 300);
});

test('same-second rewards cannot be overwritten by an earlier instance snapshot', async () => {
  const f = await ownedPets('mirror-newer-reward');
  await f.award(f.a, 20, 'mirror-newer-reward:first');
  const raced = f.before(s => /UPDATE telegram_pet_profiles SET/.test(s.query), async () => {
    assert.equal((await f.award(f.a, 20, 'mirror-newer-reward:second')).accepted, true);
  });
  assert.equal((await hooks.getPetProfile(f.db, f.owner)).pet_xp, 240);
  raced();
  assert.equal(f.instance(f.a).pet_xp, 240);
  assert.equal(f.profile().pet_xp, 240);
});

test('a reward caller without pet_id freezes its original active instance across a concurrent switch', async () => {
  const f = await ownedPets('implicit-reward-source');
  const raced = f.before(s => /INSERT OR IGNORE INTO telegram_pet_reward_claims/.test(s.query), async () => {
    assert.equal((await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.b)).accepted, true);
  });
  const request = { telegram_id: f.owner, source: 'pet_job', idempotency_key: 'implicit-reward-source:new',
    event_key: 'implicit-reward-source:new', rewards: { pet_xp: 10 } };
  const result = await hooks.awardPetReward(f.db, request);
  raced();
  assert.equal(result.accepted, true);
  assert.equal(result.refresh_state, true);
  assert.equal(f.instance(f.a).pet_xp, 210);
  assert.equal(f.instance(f.b).pet_xp, 300);
  assert.equal(f.profile().pet_xp, 300);
  assert.equal(f.sql.prepare('SELECT pet_id FROM telegram_pet_events WHERE event_key=?').get(request.event_key).pet_id, f.a);
  assert.equal((await hooks.awardPetReward(f.db, request)).duplicate, true);
  assert.equal(f.instance(f.a).pet_xp, 210);
  assert.equal(f.instance(f.b).pet_xp, 300);
});

test('concurrent implicit rewards retain legacy nullable cap evidence without reducing explicit per-pet allowances', async () => {
  const f = await adoptedPlayer('implicit-legacy-cap');
  const day = new Date().toISOString().slice(0, 10);
  f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,telegram_id,event_type,event_key,pet_xp_awarded,xp_awarded,season_key,day_key,week_key,status)
    VALUES ('legacy-cap',?,'cap_fixture','legacy-cap',1190,245,?,?,'fixture-week','accepted')`)
    .run(f.owner, f.instance(f.a).season_key, day);
  const savedLegacy = f.sql.prepare("SELECT * FROM telegram_pet_events WHERE id='legacy-cap'").get();
  const results = await Promise.all([1, 2].map(index => hooks.awardPetReward(f.db, {
    telegram_id: f.owner, source: 'pet_action', idempotency_key: 'implicit-cap:' + index,
    event_key: 'implicit-cap:' + index, rewards: { pet_xp: 100, community_xp: 20 },
  })));
  assert.equal(results.every(result => result.accepted), true);
  assert.equal(results.reduce((sum, result) => sum + result.pet_xp_awarded, 0), 10);
  assert.equal(results.reduce((sum, result) => sum + result.xp_awarded, 0), 5);
  assert.equal(f.instance(f.a).pet_xp, 10);
  assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_events WHERE id='legacy-cap'").get(), savedLegacy,
    'nullable historical attribution must remain unchanged');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_key LIKE 'implicit-cap:%' AND pet_id=?").get(f.a).n, 2);
  assert.equal((await hooks.buyPetSeasonSlot(f.db, f.owner, 2)).accepted, true);
  const other = f.sql.prepare("SELECT pet_id FROM telegram_pet_season_slots WHERE telegram_id=? AND acquisition_type='arcade_xp'").get(f.owner).pet_id;
  assert.equal((await f.award(other, 100, 'explicit-pet-cap')).pet_xp_awarded, 100,
    'a distinct explicitly recorded pet retains its own daily XP allowance');
  assert.equal(f.instance(other).pet_xp, 100);
});

test('implicit rewards count their frozen pet receipts without consuming another pet daily allowance', async () => {
  const f = await adoptedPlayer('implicit-per-pet-cap');
  assert.equal((await hooks.buyPetSeasonSlot(f.db, f.owner, 2)).accepted, true);
  f.b = f.sql.prepare("SELECT pet_id FROM telegram_pet_season_slots WHERE telegram_id=? AND acquisition_type='arcade_xp'").get(f.owner).pet_id;
  assert.equal((await f.award(f.b, 1200, 'implicit-per-pet-cap:other')).pet_xp_awarded, 1200);
  const award = (key, xp) => hooks.awardPetReward(f.db, {
    telegram_id: f.owner, source: 'pet_action', idempotency_key: key,
    event_key: key, rewards: { pet_xp: xp },
  });
  const first = await Promise.all([1, 2].map(index => award('implicit-per-pet-cap:' + index, 100)));
  assert.equal(first.every(result => result.accepted), true);
  assert.equal(first.reduce((sum, result) => sum + result.pet_xp_awarded, 0), 200,
    'another pet reaching its cap cannot withhold this pet allowance');
  assert.equal((await award('implicit-per-pet-cap:fill', 1100)).pet_xp_awarded, 1000,
    'new attributed implicit receipts participate in the same pet daily cap');
  assert.equal((await award('implicit-per-pet-cap:exhausted', 10)).pet_xp_awarded, 0);
  assert.equal(f.instance(f.a).pet_xp, 1200);
  assert.equal(f.instance(f.b).pet_xp, 1200);
});

test('deleting the target before a switch transaction leaves the current pet and mirror intact', async () => {
  const f = await ownedPets('switch-deleted-target');
  const before = f.instance(f.a);
  const raced = f.before(s => /UPDATE telegram_pet_active_slots SET pet_id=/.test(s.query), async () => {
    const result = await hooks.deletePetSlot(f.db, f.owner, { pet_id: f.b, confirm_pet_id: f.b, confirmed: true });
    assert.equal(result.accepted, true);
  });
  const result = await hooks.switchActivePetSeasonSlot(f.db, f.owner, f.b);
  raced();
  assert.equal(result.accepted, false);
  assert.equal(f.active(), f.a);
  assert.equal(f.instance(f.b).status, 'archived');
  assert.equal(f.instance(f.a).pet_xp, before.pet_xp);
  assert.equal(f.profile().pet_xp, before.pet_xp);
});

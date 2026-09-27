import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
let beforeBatch = null, tail = Promise.resolve();
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (/\bRETURNING\b/i.test(this.sql)) { const results = sqlite.prepare(this.sql).all(...this.args); return { results, meta: { changes: results.length } }; }
    const result = sqlite.prepare(this.sql).run(...this.args); return { results: [], meta: { changes: Number(result.changes) } };
  }
}
const db = {
  prepare(sql) { return new Statement(sql); },
  batch(statements) {
    const task = tail.then(async () => {
      if (beforeBatch) beforeBatch(statements);
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    tail = task.catch(() => {}); return task;
  },
};
async function seed(id) {
  sqlite.prepare('INSERT INTO telegram_users (telegram_id, first_name, xp, level) VALUES (?, ?, 0, 1)').run(id, id);
  sqlite.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_name, pet_xp, level, energy, moon_gold) VALUES (?, ?, 3240, 20, 80, 100)').run(id, id);
  await hooks.ensurePetStarterSeasonSlot(db, id);
  const pet = await hooks.ensureActivePetInstance(db, id);
  sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id, telegram_id, identity_seed, phase, incubation_json, innate_traits_json)
    VALUES (?, ?, ?, 'young', '{}', '[]')`).run(pet.pet_id, id, id);
  return pet;
}
const id = 'concurrent-trade';
await seed(id);
const realRandom = Math.random;
try {
  Math.random = () => 0.9;
  for (const mode of ['job', 'adventure']) {
    const owner = 'concurrent-' + mode;
    const pet = await seed(owner);
    const eventType = mode === 'job' ? 'work' : 'adventure';
    const perform = (i) => mode === 'job'
      ? hooks.processPetJob(db, owner, i === 1 ? 'street_artist' : 'courier', { event_key: mode + '-race-' + i })
      : hooks.processPetAdventure(db, owner, 'push_forward', { event_key: mode + '-race-' + i, encounter_key: 'moon_alley' });
    const actions = await Promise.all([perform(1), perform(2)]);
    assert.equal(actions.filter((r) => r.accepted).length, 1, mode + ' cooldown must be atomic across distinct keys');
    const rejected = actions.find((r) => !r.accepted);
    assert.equal(rejected.reason, mode === 'job' ? 'cooldown' : 'adventure_cooldown');
    assert.ok(rejected.cooldown.remaining_seconds > (mode === 'job' ? 40 : 1790));
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM telegram_pet_events WHERE telegram_id=? AND event_type=?').get(owner, eventType).n, 1);
    const accepted = actions.find((r) => r.accepted);
    assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(pet.pet_id).pet_xp, 3240 + accepted.pet_xp_awarded);
    assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(owner).moon_gold, 100 + accepted.rewards.moon_gold);
    assert.equal((await perform(actions[0].accepted ? 1 : 2)).duplicate, true, mode + ' accepted receipt remains replayable');
    sqlite.prepare("UPDATE telegram_pet_events SET created_at=datetime('now','-31 minutes') WHERE telegram_id=? AND event_type=?").run(owner, eventType);
    const afterCooldown = await perform(actions[0].accepted ? 2 : 1);
    assert.equal(afterCooldown.accepted, true, mode + ' becomes playable after cooldown: ' + afterCooldown.reason);
  }
  const energyOwner = 'adventure-energy-change';
  const energyPet = await seed(energyOwner);
  beforeBatch = (statements) => {
    if (!statements[0].sql.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims')) return;
    beforeBatch = null;
    sqlite.prepare('UPDATE telegram_pet_instances SET energy=0 WHERE pet_id=?').run(energyPet.pet_id);
    sqlite.prepare('UPDATE telegram_pet_profiles SET energy=0 WHERE telegram_id=?').run(energyOwner);
  };
  const depleted = await hooks.processPetAdventure(db, energyOwner, 'push_forward', { event_key: 'energy-change', encounter_key: 'moon_alley' });
  assert.equal(depleted.accepted, false, 'Adventure must recheck current pet energy during settlement');
  assert.equal(depleted.reason, 'pet_tired');
  assert.equal(depleted.applied, undefined, 'rejected Adventures must not display a rolled success');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE telegram_id=? AND event_type='adventure'").get(energyOwner).n, 0);
  assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(energyOwner).moon_gold, 100);

  const trades = await Promise.all([1, 2].map((i) => hooks.processPetGoldTrade(db, id, 50, { event_key: 'trade-race-' + i })));
  assert.equal(trades.filter((r) => r.accepted).length, 1, 'only one concurrent trade can pass the account cooldown');
  assert.equal(trades.find((r) => !r.accepted).reason, 'trade_cooldown');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE telegram_id=? AND event_type='trade' AND status='accepted'").get(id).n, 1);
  assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(id).moon_gold, 137);
  const acceptedKey = trades[0].accepted ? 'trade-race-1' : 'trade-race-2';
  assert.equal((await hooks.processPetGoldTrade(db, id, 50, { event_key: acceptedKey })).duplicate, true);
  let state = await hooks.buildPetMiniAppState(db, id, 'test-token');
  assert.ok(state.trade.offers.every((offer) => !offer.available));
  assert.ok(state.trade.cooldown.remaining_seconds > 290);
  assert.ok(state.cooldowns.entries.some((entry) => entry.key === 'trade'));
  sqlite.prepare("UPDATE telegram_pet_events SET created_at=datetime('now','-6 minutes') WHERE telegram_id=? AND event_type='trade'").run(id);
  sqlite.prepare('UPDATE telegram_pet_profiles SET moon_gold=20 WHERE telegram_id=?').run(id);
  state = await hooks.buildPetMiniAppState(db, id, 'test-token');
  assert.equal(state.trade.cooldown, null);
  assert.deepEqual(state.trade.offers.map((offer) => offer.available), [true, false, false]);
  assert.equal((await hooks.processPetGoldTrade(db, id, 25)).reason, 'not_enough_moon_gold');
  assert.equal((await hooks.processPetGoldTrade(db, id, 10, { event_key: 'after-cooldown' })).accepted, true);

  for (const change of ['balance', 'xp', 'active-pet', 'daily-cap']) {
    const owner = 'trade-change-' + change;
    const pet = await seed(owner);
    beforeBatch = (statements) => {
      if (!statements[0].sql.includes("'trade_pending'")) return;
      beforeBatch = null;
      if (change === 'balance') sqlite.prepare('UPDATE telegram_pet_profiles SET moon_gold=0 WHERE telegram_id=?').run(owner);
      if (change === 'xp') {
        sqlite.prepare('UPDATE telegram_pet_profiles SET pet_xp=3241 WHERE telegram_id=?').run(owner);
        sqlite.prepare('UPDATE telegram_pet_instances SET pet_xp=3241 WHERE pet_id=?').run(pet.pet_id);
      }
      if (change === 'active-pet') sqlite.prepare('DELETE FROM telegram_pet_active_slots WHERE telegram_id=?').run(owner);
      if (change === 'daily-cap') sqlite.prepare(`INSERT INTO telegram_pet_events
        (id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status,metadata)
        VALUES (?,?,'fixture',?,1200,?,?,'fixture','accepted','{}')`).run(owner, owner, owner, pet.season_key, new Date().toISOString().slice(0, 10));
    };
    const changed = await hooks.processPetGoldTrade(db, owner, 50, { event_key: 'changed-state' });
    assert.equal(changed.accepted, false, change + ' must be checked inside the transaction');
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE telegram_id=? AND event_type='trade'").get(owner).n, 0);
    assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(pet.pet_id).pet_xp, change === 'xp' ? 3241 : 3240);
    if (change === 'daily-cap') {
      const capped = await hooks.processPetGoldTrade(db, owner, 50, { event_key: 'after-cap-refresh' });
      assert.equal(capped.accepted, true);
      assert.equal(capped.pet_xp_awarded, 0, 'an exhausted XP cap does not invent XP on retry');
    }
  }
} finally { Math.random = realRandom; sqlite.close(); }
console.log('Moonpet Trade, Job and Adventure availability and concurrency tests passed.');

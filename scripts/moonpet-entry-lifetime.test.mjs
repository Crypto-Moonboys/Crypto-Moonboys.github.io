import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { getPetEntryRequirement } from '../workers/moonboys-api/pets/entry-requirement.js';
import { awardPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for (const path of ['schema.sql', 'migrations/048_telegram_pet_player_expansion.sql', 'migrations/058_telegram_pet_season_completion.sql', 'migrations/061_moonpet_season_economy_calibration.sql']) {
  sqlite.exec(await readFile(new URL('../workers/moonboys-api/' + path, import.meta.url), 'utf8'));
}
let failEntryRead = false, failCreation = false, beforeCreation = null;
class Statement {
  constructor(sql, args = []) { Object.assign(this, { sql, args }); }
  bind(...args) { return new Statement(this.sql, args); }
  async first() {
    if (failEntryRead && this.sql.includes('AS lifetime_xp')) return { success: false, error: 'unavailable' };
    return sqlite.prepare(this.sql).get(...this.args) || null;
  }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (this.sql.includes('INSERT OR IGNORE INTO telegram_pet_profiles')) {
      if (failCreation) return { success: false, error: 'unavailable' };
      if (beforeCreation) { const callback = beforeCreation; beforeCreation = null; callback(); }
    }
    if (/RETURNING/i.test(this.sql)) {
      const results = sqlite.prepare(this.sql).all(...this.args);
      return { results, meta: { changes: results.length } };
    }
    return { meta: { changes: sqlite.prepare(this.sql).run(...this.args).changes } };
  }
}
const db = {
  prepare: sql => new Statement(sql),
  async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sqlite.exec('COMMIT'); return results;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
function player(id, xp, spendable = 0) {
  sqlite.prepare('INSERT INTO telegram_users (telegram_id,xp,level) VALUES (?,999999,999)').run(id);
  sqlite.prepare('INSERT INTO arcade_progression_state (telegram_id,arcade_xp_total) VALUES (?,?)').run(id, xp);
  sqlite.prepare('INSERT INTO arcade_xp_wallets (telegram_id,arcade_xp_earned,arcade_xp_spendable,arcade_xp_spent) VALUES (?,?,?,?)').run(id, xp, spendable, xp - spendable);
}
const ownershipTables = ['telegram_pet_profiles', 'telegram_pet_season_slots', 'telegram_pet_instances', 'telegram_pet_lifecycle_by_pet'];
function noPet(id) {
  for (const table of ownershipTables) assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ' + table + ' WHERE telegram_id=?').get(id).n, 0, table + ' must stay empty');
}
const adopt = (id, options = {}) => hooks.processPetAction(db, id, 'adopt', { event_key: id + ':adopt', ...options });

player('below', 999);
const wallet = sqlite.prepare("SELECT * FROM arcade_xp_wallets WHERE telegram_id='below'").get();
const blocked = await adopt('below', { arcade_xp_total: 999999, arcade_xp: 999999, xp: 999999 });
assert.equal(blocked.reason, 'arcade_xp_entry_required', 'client XP and high Community XP cannot bypass Arcade eligibility');
assert.equal(blocked.entry_requirement.remaining_arcade_xp, 1);
assert.deepEqual(hooks.serializePetMiniAppActionResult(blocked).entry_requirement, blocked.entry_requirement);
noPet('below');
assert.deepEqual(sqlite.prepare("SELECT * FROM arcade_xp_wallets WHERE telegram_id='below'").get(), wallet);
for (const state of [await hooks.buildPetMiniAppCoreState(db, 'below'), await hooks.buildPetMiniAppState(db, 'below', '')]) {
  assert.equal(state.adopted, false);
  assert.equal(state.entry_requirement.eligible, false);
  assert.equal(state.next.available, false);
  assert.match(state.next.detail, /1 more Arcade XP/);
}
noPet('below');
sqlite.prepare("UPDATE arcade_progression_state SET arcade_xp_total=1000 WHERE telegram_id='below'").run();
assert.equal((await hooks.buildPetMiniAppCoreState(db, 'below')).entry_requirement.eligible, true);
assert.equal((await adopt('below')).accepted, true, 'exactly 1,000 lifetime XP qualifies with a zero spendable wallet');
assert.deepEqual(sqlite.prepare("SELECT * FROM arcade_xp_wallets WHERE telegram_id='below'").get(), wallet, 'first-pet entry does not debit or rebuild the wallet');
assert.equal((await adopt('below')).reason, 'pet_already_adopted');
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM telegram_pet_instances WHERE telegram_id='below'").get().n, 1);

player('race', 1000);
beforeCreation = () => sqlite.prepare("UPDATE arcade_progression_state SET arcade_xp_total=999 WHERE telegram_id='race'").run();
assert.equal((await adopt('race')).reason, 'arcade_xp_entry_required', 'the write rechecks XP after the eligibility read');
noPet('race');
player('failed-read', 1000);
failEntryRead = true;
await assert.rejects(adopt('failed-read'), /pet_state_read_unavailable/);
await assert.rejects(hooks.buildPetMiniAppCoreState(db, 'failed-read'), /pet_state_read_unavailable/);
failEntryRead = false;
noPet('failed-read');
failCreation = true;
await assert.rejects(adopt('failed-read'), /pet_state_write_unavailable/);
failCreation = false;
noPet('failed-read');
sqlite.prepare("INSERT INTO telegram_users (telegram_id) VALUES ('no-arcade')").run();
assert.equal((await adopt('no-arcade')).reason, 'arcade_xp_entry_required', 'a missing Arcade record never qualifies');
noPet('no-arcade');

// Existing beta owners retain access, even when their lifetime Arcade XP is zero.
player('legacy', 0);
sqlite.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp) VALUES ('legacy',4321)").run();
assert.equal((await getPetEntryRequirement(db, 'legacy')).existing_owner, true);
await hooks.preparePetMiniAppState(db, 'legacy');
const legacy = await hooks.getPetProfile(db, 'legacy');
assert.equal(legacy.pet_xp, 4321);
assert.equal((await adopt('legacy')).reason, 'pet_already_adopted');

// A late-joining pet starts at lifetime week one, rather than quarter week 13.
sqlite.prepare("UPDATE telegram_pet_season_slots SET created_at='2026-09-30T12:00:00Z' WHERE telegram_id='legacy'").run();
const petId = legacy.pet_id;
const source = legacy.season_key;
sqlite.prepare(`INSERT INTO telegram_pet_growth_marks (mark_id,pet_id,telegram_id,season_key,milestone_type,evidence_key,earned_day)
  VALUES ('mark',?,'legacy',?,'daily_journey','saved-daily','2026-09-30')`).run(petId, source);
sqlite.prepare(`INSERT INTO telegram_pet_weekly_crests (crest_id,pet_id,telegram_id,season_key,season_week,objective_id,evidence_key,qualification_week)
  VALUES ('crest',?,'legacy',?,1,'weekly_journey','saved-weekly',1)`).run(petId, source);
const before = await hooks.buildPetSeasonSlotSummary(db, 'legacy', new Date('2026-09-30T18:00:00Z'));
const after = await hooks.buildPetSeasonSlotSummary(db, 'legacy', new Date('2027-01-01T12:00:00Z'));
const first = before.slots.find(slot => slot.active).pet.lifetime_progression;
const later = after.slots.find(slot => slot.active).pet.lifetime_progression;
assert.equal(first.current_week, 1);
assert.equal(later.current_week, 14);
assert.equal(later.pet_xp, first.pet_xp);
assert.equal(later.completion.scope, 'pet_lifetime');
assert.deepEqual(later.completion.growth_marks, first.completion.growth_marks);
assert.equal(later.completion.growth_marks.earned, 1);
assert.equal(later.completion.weekly_crests.earned, 1);
assert.notEqual(after.competition_season.key, before.competition_season.key);
assert.equal(after.slots.find(slot => slot.active).season_key, source, 'stored receipt provenance never rolls over');

// The same permanent pet earns separate competition scores in two quarters.
for (const [day, competition] of [['2026-09-30', 'pet-s2026-003'], ['2027-01-01', 'pet-s2027-001']]) {
  const request = { telegram_id: 'legacy', pet_id: petId, season_key: source,
    source: 'pet_job', idempotency_key: day + ':job', event_key: day + ':job',
    rewards: { pet_xp: 20 }, now: day + 'T12:00:00Z' };
  assert.equal((await awardPetReward(db, request)).accepted, true);
  assert.equal(sqlite.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key=?').get('legacy', competition).season_xp, 20);
  const duplicate = await awardPetReward(db, request);
  assert.equal(duplicate.duplicate, true);
  assert.equal(sqlite.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key=?').get('legacy', competition).season_xp, 20);
}
assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(petId).pet_xp, 4361, 'both awards accumulate on the same lifetime pet');
assert.deepEqual(sqlite.prepare("SELECT DISTINCT season_key FROM telegram_pet_events WHERE event_key IN ('2026-09-30:job','2027-01-01:job')").all().map(row => row.season_key), [source]);
sqlite.prepare(`INSERT INTO telegram_pet_events (id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,reason)
  VALUES ('reserved','legacy','reserved_reward','reserved',?,'2026-09-30','2026-W40','pending','reserved')`).run(source);
assert.equal((await awardPetReward(db, { telegram_id: 'legacy', pet_id: petId, season_key: source,
  source: 'pet_job', idempotency_key: 'reserved-claim', reservation_id: 'reserved',
  day_key: '2026-09-30', week_key: '2026-W40', rewards: { pet_xp: 10 }, now: '2027-01-01T12:01:00Z' })).accepted, true);
assert.equal(sqlite.prepare("SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id='legacy' AND season_key='pet-s2026-003'").get().season_xp, 30, 'delayed reserved XP belongs to its earning quarter');
assert.equal(sqlite.prepare("SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id='legacy' AND season_key='pet-s2027-001'").get().season_xp, 20);

player('trade', 0);
sqlite.prepare("INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,moon_gold) VALUES ('trade',100,200)").run();
await hooks.ensurePetStarterSeasonSlot(db, 'trade', new Date('2001-01-01T12:00:00Z'));
await hooks.ensureActivePetInstance(db, 'trade');
const tradePet = await hooks.getPetProfile(db, 'trade');
const random = Math.random;
Math.random = () => 0.9;
try {
  const trade = await hooks.processPetGoldTrade(db, 'trade', '50', { event_key: 'trade:award' });
  assert.equal(trade.accepted, true);
  assert.equal(sqlite.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key=?')
    .get('trade', hooks.getPetSeasonInfo(new Date()).key).season_xp, trade.pet_xp_awarded);
  assert.equal(sqlite.prepare("SELECT season_key FROM telegram_pet_events WHERE event_key='trade:award'").get().season_key, tradePet.season_key);
} finally { Math.random = random; }
assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
console.log('Moonpet Arcade entry and lifetime progression tests passed');

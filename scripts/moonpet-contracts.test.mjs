import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { advanceContract, contractChoices, contractPreparations, contractRoom, contractSideProgress, createContractState, getContractBoard, processContractAction } from '../workers/moonboys-api/pets/continuing-contracts.js';
import { awardPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const sqlite = new DatabaseSync(':memory:');
const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
sqlite.exec(read('workers/moonboys-api/schema.sql'));
sqlite.exec(read('workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql'));
const migration = read('workers/moonboys-api/migrations/076_moonpet_continuing_contracts.sql');
sqlite.exec(migration); sqlite.exec(migration);
let beforeStatement = null;
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { if (beforeStatement) beforeStatement(this.sql, this.args); return sqlite.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (/\bRETURNING\b/i.test(this.sql)) { const results = sqlite.prepare(this.sql).all(...this.args); return { results, meta: { changes: results.length } }; }
    const r = sqlite.prepare(this.sql).run(...this.args); return { results: [], meta: { changes: Number(r.changes) } };
  }
}
const db = { prepare(sql) { return new Statement(sql); }, async batch(statements) {
  sqlite.exec('BEGIN IMMEDIATE');
  try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; }
  catch (e) { sqlite.exec('ROLLBACK'); throw e; }
} };
async function seed(owner, phase = 'young') {
  sqlite.prepare('INSERT INTO telegram_users (telegram_id, first_name, xp, level) VALUES (?, ?, 0, 1)').run(owner, owner);
  sqlite.prepare(`INSERT INTO telegram_pet_profiles (telegram_id,pet_name,pet_xp,level,health,energy,moon_gold) VALUES (?,?,3240,20,90,0,100)`).run(owner, owner);
  await hooks.ensurePetStarterSeasonSlot(db, owner);
  const pet = await hooks.ensureActivePetInstance(db, owner);
  sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json) VALUES (?,?,?,?,'{}','[]')`).run(pet.pet_id, owner, owner, phase);
  sqlite.prepare('UPDATE telegram_pet_instances SET stage=? WHERE pet_id=?').run(phase, pet.pet_id);
  return { ...pet, stage: phase };
}
const now = new Date();
const a = await seed('contract-a'), b = await seed('contract-b'), egg = await seed('contract-egg', 'egg');
const act = (pet, request, award = awardPetReward, time = now) => processContractAction(db, pet.telegram_id, pet, { pet_id: pet.pet_id, ...request }, award, time);
const board = (pet, time = now) => getContractBoard(db, pet.telegram_id, pet, time);
const start = async (pet, goal = 'escort', time = now) => act(pet, { action: 'contract_start', sequence: (await board(pet, time)).next_sequence, goal, build: 'bruiser', tier: 1 }, awardPetReward, time);
async function complete(pet, award = awardPetReward, time = now) {
  let result;
  for (let step = 0; step < 10; step++) {
    const run = (await board(pet, time)).run;
    if (run.status !== 'active') return run;
    const choice = run.choices.find((x) => x.key === 'medkit') || run.choices.find((x) => x.key === 'shield') || run.choices.find((x) => x.key === 'cover') || run.choices[0];
    result = await act(pet, { action: 'contract_step', contract_id: run.contract_id, revision: run.revision, choice: choice.key, roll: 0, reward_xp: 999999 }, award, time);
    assert.equal(result.accepted, true, JSON.stringify(result));
  }
  assert.fail('contract did not terminate: ' + JSON.stringify(result));
}

// Exhaustive state mechanics across goals/builds/tiers and deterministic roll streams.
let clears = 0, failures = 0, drafts = 0;
for (const goal of ['scout', 'salvage', 'escort']) for (const build of ['scout', 'bruiser', 'scavenger']) for (const tier of [1, 2, 3]) for (let seed = 0; seed < 40; seed++) {
  let s = createContractState(goal, build, tier, 'seed-' + seed, ['none', 'versatile', 'daredevil', 'stocked'][seed % 4]), status = 'active';
  for (let turn = 0; status === 'active'; turn++) {
    assert.ok(turn < 10);
    const action = s.draft.length ? s.draft[seed % s.draft.length] : ['cover', 'bold', 'search'][(seed + turn) % 3];
    if (s.draft.length) drafts++;
    const prior = structuredClone(s), n = advanceContract(s, action, (seed * 13 + turn * 7) % 100);
    assert.deepEqual(s, prior, 'engine input is immutable');
    assert.ok(n); s = n.state; status = n.status;
    assert.ok(s.health >= 0 && s.health <= s.max_health && s.depth <= 6);
    if (status === 'completed') {
      clears++; const side = contractSideProgress(s);
      assert.equal(n.rank_points, (40 + s.salvage + s.wins * 5) * s.tier + (side?.reached ? 60 * s.tier : 0));
    }
    if (status === 'failed') { failures++; assert.equal(n.rank_points, 0); }
  }
}
assert.ok(clears && failures && drafts);
assert.equal(createContractState('__proto__', 'scout', 1, 'x'), null);
assert.equal(createContractState('escort', 'scout', 4, 'x'), null);
assert.equal(advanceContract(createContractState('escort', 'scout', 1, 'x'), 'rest', 0), null);
assert.equal(createContractState('escort', 'scout', 1, 'x', '__proto__'), null);
for (const invalid of [null, ['versatile'], { toString: 'versatile' }, 1]) assert.equal(createContractState('escort', 'scout', 1, 'x', invalid), null);

// Every authored room affects actual outcomes, with previews using the same rules.
const seenRooms = new Set();
for (let i = 0; i < 80; i++) {
  const s = { ...createContractState('escort', 'bruiser', 2, 'room-' + i), depth: i < 79 ? 1 : 5 };
  const legacy = { ...s, version: 1 };
  seenRooms.add(contractRoom(s).title);
  assert.equal(contractRoom(legacy).rule, null);
  assert.notDeepEqual(contractChoices(s), contractChoices(legacy), 'room must change play, not just its name');
  for (const choice of contractChoices(s).filter((c) => c.key !== 'rest')) {
    assert.ok(choice.odds >= 30 && choice.odds <= 98);
    const win = advanceContract(s, choice.key, choice.odds - 1).state;
    const loss = advanceContract(s, choice.key, choice.odds).state;
    assert.equal(win.salvage - s.salvage, choice.salvage);
    assert.equal(win.route_wins[choice.key], 1);
    assert.equal(s.health - loss.health, choice.damage);
    assert.equal(loss.route_wins[choice.key], 0, 'failures cannot advance side objectives');
  }
}
assert.equal(seenRooms.size, 8);
const legacyState = { version: 1, goal: 'escort', build: 'bruiser', tier: 1, seed: 'old', depth: 5, wins: 5, health: 110, max_health: 110, supplies: 1, salvage: 40, perks: [], draft: [], last: '' };
assert.deepEqual(contractChoices(legacyState).slice(0, 3).map(({ odds, damage, salvage }) => [odds, damage, salvage]), [[80, 20, 8], [76, 34, 27], [70, 26, 19]], 'saved v1 odds and resources stay unchanged');
assert.equal(advanceContract(legacyState, 'cover', 0).rank_points, 118);
assert.equal(contractSideProgress(legacyState), null);

// Preparations spend contract resources, do not advance a room or award points,
// and use the same chance preview as resolution. Existing v1/v2 rules are frozen.
for (const build of ['scout', 'bruiser', 'scavenger']) for (const tier of [1, 2, 3]) {
  const s = { ...createContractState('salvage', build, tier, 'prepared-' + build, 'stocked'), depth: 1, supplies: 4, salvage: 65, health: 40 };
  const before = contractChoices(s);
  const scouted = advanceContract(s, 'prepare_scout', 0);
  assert.equal(scouted.state.depth, s.depth); assert.equal(scouted.state.supplies, 2);
  assert.equal(scouted.rank_points, 0); assert.equal(contractPreparations(scouted.state).length, 0);
  assert.equal(advanceContract(scouted.state, 'prepare_scout', 0), null);
  assert.equal(advanceContract(scouted.state, 'prepare_patch', 0), null);
  for (let i = 0; i < 3; i++) {
    const choice = contractChoices(scouted.state)[i];
    assert.equal(choice.odds, Math.min(98, before[i].odds + 10));
    assert.equal(choice.salvage, before[i].salvage); assert.equal(choice.damage, before[i].damage);
    assert.equal(advanceContract(scouted.state, choice.key, choice.odds - 1).state.wins, 1);
    assert.equal(advanceContract(scouted.state, choice.key, choice.odds).state.wins, 0);
    assert.equal(advanceContract(scouted.state, choice.key, 0).state.preparation, null);
  }
  const patched = advanceContract(s, 'prepare_patch', 0);
  assert.equal(patched.state.health, 65); assert.equal(patched.state.salvage, 45);
  assert.equal(patched.state.depth, 1); assert.equal(patched.rank_points, 0);
  assert.equal(patched.status, 'active');
  assert.equal(advanceContract({ ...s, supplies: 1 }, 'prepare_scout', 0), null);
  assert.equal(advanceContract({ ...s, salvage: 19 }, 'prepare_patch', 0), null);
  assert.equal(advanceContract({ ...s, health: s.max_health }, 'prepare_patch', 0), null);
  assert.equal(advanceContract({ ...s, draft: ['radar'] }, 'prepare_scout', 0), null);
  for (const version of [1, 2]) {
    const old = { ...s, version };
    assert.deepEqual(contractPreparations(old), []);
    assert.equal(advanceContract(old, 'prepare_scout', 0), null);
    assert.deepEqual(contractChoices({ ...old, preparation: 'prepare_scout' }), contractChoices(old));
    if (version === 2) assert.deepEqual(contractChoices(old), before);
  }
}

function finishSide(side, actions, tier = 1) {
  let s = createContractState('escort', 'scavenger', tier, 'side-test', side), result;
  for (const action of actions) {
    if (s.draft.length) s = advanceContract(s, s.draft.find((key) => key !== 'pockets') || s.draft[0], 0).state;
    result = advanceContract(s, action, 0); s = result.state;
  }
  return result;
}
const beforePatch = { ...createContractState('salvage', 'scout', 1, 'patch-tradeoff'), depth: 5, health: 40, salvage: 65 };
assert.equal(advanceContract(beforePatch, 'cover', 0).status, 'completed');
const afterPatch = advanceContract(beforePatch, 'prepare_patch', 0).state;
const missedAfterPatch = advanceContract(afterPatch, 'cover', 0);
assert.equal(missedAfterPatch.status, 'failed', 'spending salvage can sacrifice the selected salvage goal');
assert.equal(missedAfterPatch.rank_points, 0);
for (const [side, actions] of [
  ['versatile', ['cover', 'bold', 'search', 'cover', 'cover', 'cover']],
  ['daredevil', ['bold', 'bold', 'bold', 'cover', 'cover', 'cover']],
  ['stocked', ['search', 'search', 'cover', 'cover', 'cover', 'cover']],
]) {
  const result = finishSide(side, actions, 2);
  assert.equal(result.status, 'completed'); assert.equal(contractSideProgress(result.state).reached, true);
  assert.equal(result.rank_points, (40 + result.state.salvage + 30 + 60) * 2);
}
const missed = finishSide('versatile', Array(6).fill('cover'));
assert.equal(missed.status, 'completed', 'optional target cannot fail a successful main goal');
assert.equal(contractSideProgress(missed.state).reached, false);
assert.equal(advanceContract(missed.state, 'cover', 0), null, 'finished state cannot earn another side bonus');
const failedMain = advanceContract({ ...createContractState('scout', 'bruiser', 1, 'fail-main', 'daredevil'), depth: 5, wins: 2, route_wins: { cover: 0, bold: 2, search: 0 } }, 'bold', 0);
assert.equal(contractSideProgress(failedMain.state).reached, true);
assert.equal(failedMain.status, 'failed'); assert.equal(failedMain.rank_points, 0);

assert.equal((await board(egg)).available, false);
assert.equal((await act(egg, { action: 'contract_start' })).accepted, false);
assert.equal((await act(a, { action: 'contract_start', pet_id: b.pet_id })).accepted, false);
assert.equal((await act(a, { action: 'contract_start', sequence: 1, goal: 'escort', build: 'bruiser', tier: 2 })).accepted, false);

// Deterministic test-only RNG. No HTTP request can supply this server entropy.
const realCrypto = globalThis.crypto;
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: realCrypto.subtle, randomUUID: () => realCrypto.randomUUID(), getRandomValues: (values) => { values.fill(0); return values; } } });
try {
  const tacticalPet = await seed('contract-prepared');
  await act(tacticalPet, { action: 'contract_start', sequence: 1, goal: 'escort', build: 'scavenger', tier: 1 });
  let tacticalRun = (await board(tacticalPet)).run;
  const prep = { action: 'contract_step', contract_id: tacticalRun.contract_id, revision: 0, choice: 'prepare_scout' };
  const preparationRace = await Promise.all([act(tacticalPet, prep), act(tacticalPet, prep)]);
  assert.equal(preparationRace.filter((r) => r.accepted).length, 1);
  tacticalRun = (await board(tacticalPet)).run;
  assert.equal(tacticalRun.preparation, 'prepare_scout'); assert.equal(tacticalRun.supplies, 1);
  assert.equal(tacticalRun.depth, 0); assert.equal(tacticalRun.revision, 1);
  assert.equal((await board(tacticalPet)).bonus_remaining, 3);
  const unchangedPet = sqlite.prepare('SELECT energy,moon_gold,pet_xp FROM telegram_pet_profiles WHERE telegram_id=?').get(tacticalPet.telegram_id);
  assert.deepEqual({ ...unchangedPet }, { energy: 0, moon_gold: 100, pet_xp: 3240 });
  assert.equal((await act(b, { ...prep, pet_id: tacticalPet.pet_id })).accepted, false);
  assert.equal((await act(tacticalPet, { ...prep, revision: 1, choice: 'prepare_patch' })).accepted, false);
  await complete(tacticalPet);
  assert.equal((await board(tacticalPet)).completed, 1);
  const starters = await Promise.all([start(a), start(a)]);
  assert.equal(starters.filter((x) => x.accepted).length, 1, 'parallel starts must create one run');
  let run = (await board(a)).run;
  assert.ok(!JSON.stringify(run).includes('seed'), 'hidden state must not leak');
  const step = { action: 'contract_step', contract_id: run.contract_id, revision: run.revision, choice: 'cover' };
  const moves = await Promise.all([act(a, step), act(a, step)]);
  assert.equal(moves.filter((x) => x.accepted).length, 1);
  assert.equal((await board(a)).run.depth, 1);
  assert.equal((await act(b, step)).accepted, false, 'another account cannot play a contract');
  const closed = await complete(a);
  assert.equal(closed.status, 'completed'); assert.equal(closed.xp_awarded, 20);
  assert.equal((await act(a, step)).accepted, false, 'closed/stale moves cannot advance');
  assert.equal((await act(a, { action: 'contract_claim', contract_id: run.contract_id })).pet_xp_awarded, 0);

  // Real dispatcher and central reward guard: input cannot add currency or redirect XP.
  await assert.rejects(awardPetReward(db, { telegram_id: a.telegram_id, pet_id: b.pet_id, season_key: b.season_key, source: 'pet_contract', idempotency_key: 'forged', context: { contract_id: 'forged', pet_id: a.pet_id, season_key: a.season_key }, rewards: { pet_xp: 9999 } }));
  const forged = await awardPetReward(db, { telegram_id: a.telegram_id, pet_id: a.pet_id, season_key: a.season_key, source: 'pet_contract', idempotency_key: 'forged', context: { contract_id: 'forged', pet_id: a.pet_id, season_key: a.season_key }, rewards: { pet_xp: 9999, moon_gold: 999999 } });
  assert.equal(forged.accepted, false);

  // Five contracts: rank continues after the three account/day bonus reservations.
  for (let i = 0; i < 4; i++) { await start(a); await complete(a); }
  const capped = await board(a);
  assert.equal(capped.completed, 5); assert.equal(capped.bonus_remaining, 0); assert.equal(capped.max_tier, 2);
  assert.equal(capped.run.xp_awarded, 0); assert.ok(capped.rank_points > closed.rank_points);
  assert.equal(capped.offers.find((offer) => offer.key === 'escort').completed, 5);
  assert.equal(capped.offers.find((offer) => offer.key === 'scout').completed, 0);
  assert.ok(capped.offers.find((offer) => offer.key === 'escort').best_rank_points >= closed.rank_points);
  assert.equal(capped.collection.total_routes, 27);
  assert.equal(capped.collection.unlocked_routes, 18);
  assert.equal(capped.collection.cleared_routes, 1, 'repeating the same setup increases its record, not distinct route clears');
  assert.equal(capped.collection.records.find((record) => record.key === 'escort:bruiser:1').completed, 5);
  assert.equal(capped.collection.records.find((record) => record.key === 'escort:bruiser:1').best_rank_points, capped.offers.find((offer) => offer.key === 'escort').best_rank_points);
  assert.equal(capped.collection.records.find((record) => record.key === 'escort:bruiser:3').unlocked, false);
  assert.equal(capped.collection.next_route.completed, 0);
  assert.equal((await board(b)).collection.cleared_routes, 0, 'records cannot leak across owners');
  assert.equal(sqlite.prepare("SELECT SUM(pet_xp_awarded) n FROM telegram_pet_events WHERE telegram_id=? AND event_type='contract_complete'").get(a.telegram_id).n, 60);
  assert.equal(sqlite.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(a.telegram_id).moon_gold, 100);
  assert.equal(sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(a.pet_id).energy, 0, 'zero-energy pets may play without affecting vitals');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM telegram_pet_daily_journey_objectives WHERE telegram_id=?').get(a.telegram_id).n, 0);

  const tomorrow = new Date(now); tomorrow.setUTCDate(now.getUTCDate() + 1);
  assert.equal((await board(a, tomorrow)).bonus_remaining, 3);
  await start(a, 'escort', tomorrow);
  // Delivery outage does not lose the finished contract or reserve a second bonus.
  const pending = await complete(a, async () => { throw Error('delivery offline'); }, tomorrow);
  assert.equal(pending.reward_pending, true);
  const claim = { action: 'contract_claim', contract_id: pending.contract_id };
  assert.equal((await act(a, claim, awardPetReward, tomorrow)).pet_xp_awarded, 20);
  assert.equal((await act(a, claim, awardPetReward, tomorrow)).pet_xp_awarded, 0);
  assert.equal((await board(a, tomorrow)).bonus_remaining, 2);
  // Crash after award but before the local receipt: recover exact credited XP.
  sqlite.prepare('UPDATE telegram_pet_contracts SET reward_settled=0,xp_awarded=0 WHERE contract_id=?').run(pending.contract_id);
  assert.equal((await act(a, claim, awardPetReward, tomorrow)).pet_xp_awarded, 0);
  assert.equal((await board(a, tomorrow)).run.xp_awarded, 20);

  // Full cap yields zero XP, but quest completion/rank still settles.
  const capPet = await seed('contract-cap');
  sqlite.prepare(`INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status,metadata)
    VALUES ('cap',?,?, 'feed','cap',1200,?,?, 'test','accepted','{}')`).run(capPet.pet_id, capPet.telegram_id, capPet.season_key, now.toISOString().slice(0,10));
  await start(capPet); const atCap = await complete(capPet); assert.equal(atCap.status, 'completed'); assert.equal(atCap.xp_awarded, 0);
  assert.equal(atCap.reward_pending, false);

  // Slot switches preserve the original pet record and shared daily bonus budget.
  const altId = a.pet_id + ':alternate';
  sqlite.prepare(`INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type,source_event_key,arcade_xp_spent,status) VALUES (?,?,?,2,'arcade_xp','test',0,'active')`).run(altId,a.telegram_id,a.season_key);
  sqlite.prepare(`INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,stage,source_profile_updated_at) VALUES (?,?,?,2,'young',CURRENT_TIMESTAMP)`).run(altId,a.telegram_id,a.season_key);
  sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json) VALUES (?,?,'alt','young','{}','[]')`).run(altId,a.telegram_id);
  const alt = { ...a, pet_id: altId };
  await start(a);
  run = (await board(a)).run;
  beforeStatement = (sql) => { if (sql.startsWith('UPDATE telegram_pet_contracts SET state_json=')) { beforeStatement = null; sqlite.prepare('UPDATE telegram_pet_active_slots SET pet_id=? WHERE telegram_id=?').run(altId,a.telegram_id); } };
  assert.equal((await act(a, { action: 'contract_step', contract_id: run.contract_id, revision: run.revision, choice: 'cover' })).accepted, false, 'switch during a move must invalidate its write');
  assert.equal((await board(alt)).completed, 0);
  assert.equal((await board(alt)).bonus_remaining, 0, 'switching pets cannot reset account bonuses');
  await start(alt); assert.equal((await complete(alt)).xp_awarded, 0);
  assert.equal(sqlite.prepare('SELECT revision FROM telegram_pet_contracts WHERE contract_id=?').get(run.contract_id).revision, 0);

  // API dispatch accepts only server-owned state, and pre-migration availability fails closed.
  const s = await hooks.buildPetMiniAppState(db, b.telegram_id, 'fixture-token');
  assert.equal(s.contracts.available, true);
  assert.equal((await hooks.processPetMiniAppAction(db, b.telegram_id, { id:b.telegram_id }, { action:'contract_start',pet_id:b.pet_id,sequence:1,goal:'escort',build:'bruiser',tier:1,side_goal:'versatile',state_json:'{}',route_wins:{cover:99,bold:99,search:99},reward_xp:9999,request_id:realCrypto.randomUUID() }, 'fixture-token')).accepted, true);
  const sideRun = (await board(b)).run;
  assert.equal(sideRun.side_goal.key, 'versatile'); assert.equal(sideRun.side_goal.progress, 0);
  assert.ok(sideRun.room.effect);
  // A move cannot replace the selected side goal or supply its progress.
  await act(b, { action: 'contract_step', contract_id: sideRun.contract_id, revision: 0, choice: 'cover', side_goal: 'daredevil', route_wins: { bold: 99 } });
  assert.equal((await board(b)).run.side_goal.key, 'versatile');
  assert.equal((await board(b)).run.side_goal.progress, 1);
  // Real saved legacy records resume without adding room rules or side rewards.
  sqlite.prepare('UPDATE telegram_pet_contracts SET state_json=? WHERE contract_id=?').run(JSON.stringify(legacyState), sideRun.contract_id);
  const legacyRun = (await board(b)).run;
  assert.equal(legacyRun.room.effect, ''); assert.equal(legacyRun.side_goal, null);
  assert.equal((await act(b, { action: 'contract_step', contract_id: legacyRun.contract_id, revision: legacyRun.revision, choice: 'cover' })).accepted, true);
  assert.equal((await board(b)).run.rank_points, 118);
  assert.equal((await board(b)).collection.records.find((record) => record.key === 'escort:bruiser:1').completed, 1, 'legacy completed contracts contribute to the same saved records');
  const collectionPet = await seed('collection-pet');
  const chooseCollection = (goal, build, tier = 1) => board(collectionPet).then((entry) => act(collectionPet, { action: 'contract_start', sequence: entry.next_sequence, goal, build, tier }));
  assert.equal((await chooseCollection('scout', 'scout', 2)).accepted, false, 'collection shortcuts cannot bypass difficulty gates');
  await chooseCollection('scout', 'scout'); await complete(collectionPet);
  await chooseCollection('escort', 'scavenger'); await complete(collectionPet);
  assert.equal((await board(collectionPet)).collection.cleared_routes, 2);
  await chooseCollection('salvage', 'bruiser');
  const abandoning = (await board(collectionPet)).run;
  await act(collectionPet, { action: 'contract_step', contract_id: abandoning.contract_id, revision: abandoning.revision, choice: 'abandon' });
  assert.equal((await board(collectionPet)).collection.cleared_routes, 2, 'abandonment cannot award a collection clear');
  assert.equal((await board(collectionPet)).collection.records.find((record) => record.key === 'salvage:bruiser:1').completed, 0);
  sqlite.exec('DROP TABLE telegram_pet_contracts');
  assert.equal((await hooks.buildPetMiniAppState(db, b.telegram_id, 'fixture-token')).contracts.available, false);
  const blocked = await hooks.processPetMiniAppAction(db, b.telegram_id, { id:b.telegram_id }, { action:'contract_start',pet_id:b.pet_id,sequence:1,goal:'escort',build:'bruiser',tier:1,request_id:realCrypto.randomUUID() }, 'fixture-token');
  assert.equal(blocked.reason, 'contracts_unavailable');
  sqlite.exec(migration); sqlite.exec(migration);
} finally { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: realCrypto }); sqlite.close(); }
console.log(`Continuing contract tests passed: 1080 simulated runs (${clears} goals met, ${failures} failures, ${drafts} drafts), SQLite authority/concurrency/reward recovery, and actual Mini App dispatch.`);

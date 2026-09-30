import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { CONTRACT_GOALS, CONTRACT_FORMATS, advanceContract, contractLength, contractObjective, contractChoices, contractPreparations, contractDraftActions, contractPathChoices, contractFieldEncounter, contractBoss, contractRoom, contractSideProgress, createContractState, getContractBoard, processContractAction } from '../workers/moonboys-api/pets/continuing-contracts.js';
import { awardPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const sqlite = new DatabaseSync(':memory:');
const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
sqlite.exec(read('workers/moonboys-api/schema.sql'));
sqlite.exec(read('workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql'));
for (const seasonMigration of ['058_telegram_pet_season_completion.sql', '061_moonpet_season_economy_calibration.sql']) {
  sqlite.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/' + seasonMigration, import.meta.url), 'utf8'));
}
const migration = read('workers/moonboys-api/migrations/076_moonpet_continuing_contracts.sql');
sqlite.exec(migration); sqlite.exec(migration);
let beforeStatement = null;
let beforeBatch = null;
let batchQueue = Promise.resolve();
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
const db = { prepare(sql) { return new Statement(sql); }, batch(statements) {
  // D1 batches are serialized atomic transactions, including simultaneous claims.
  const task = batchQueue.then(async () => {
    if (beforeBatch) beforeBatch(statements);
    sqlite.exec('BEGIN IMMEDIATE');
    try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  });
  batchQueue = task.catch(() => {});
  return task;
} };
async function seed(owner, phase = 'young', time = new Date()) {
  sqlite.prepare('INSERT INTO telegram_users (telegram_id, first_name, xp, level) VALUES (?, ?, 0, 1)').run(owner, owner);
  sqlite.prepare(`INSERT INTO telegram_pet_profiles (telegram_id,pet_name,pet_xp,level,health,energy,moon_gold) VALUES (?,?,3240,20,90,0,100)`).run(owner, owner);
  await hooks.ensurePetStarterSeasonSlot(db, owner, time);
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
  for (let step = 0; step < 20; step++) {
    const run = (await board(pet, time)).run;
    if (run.status !== 'active') return run;
    const route = run.goal === 'breach' ? 'bold' : ['recon', 'resupply'].includes(run.goal) ? 'search' : 'cover';
    const choice = run.choices.find((x) => x.key === 'medkit') || run.choices.find((x) => x.key === 'shield') || run.choices.find((x) => x.key === route) || run.choices[0];
    result = await act(pet, { action: 'contract_step', contract_id: run.contract_id, revision: run.revision, choice: choice.key, roll: 0, reward_xp: 999999 }, award, time);
    assert.equal(result.accepted, true, JSON.stringify(result));
  }
  assert.fail('contract did not terminate: ' + JSON.stringify(result));
}

// Exhaustive state mechanics across goals/builds/tiers and deterministic roll streams.
let clears = 0, failures = 0, drafts = 0, fieldDecisions = 0;
const fieldActionsSeen = new Set();
for (const format of Object.keys(CONTRACT_FORMATS)) for (const goal of Object.keys(CONTRACT_GOALS)) for (const build of ['scout', 'bruiser', 'scavenger']) for (const tier of [1, 2, 3]) for (let seed = 0; seed < 40; seed++) {
  let s = createContractState(goal, build, tier, 'seed-' + seed, ['none', 'versatile', 'daredevil', 'stocked'][seed % 4], format), status = 'active';
  for (let turn = 0; status === 'active'; turn++) {
    assert.ok(turn < 28);
    const paths = contractPathChoices(s);
    const field = contractFieldEncounter(s)?.choices.filter((choice) => !choice.disabled);
    const action = field?.length && seed % 4 !== 3 ? field[seed % field.length].key : paths.length && seed % 4 !== 3 ? paths[seed % paths.length].key : s.draft.length ? s.draft[seed % s.draft.length] : ['cover', 'bold', 'search'][(seed + turn) % 3];
    if (action.startsWith('field_')) { fieldDecisions++; fieldActionsSeen.add(action); }
    if (s.draft.length) drafts++;
    const prior = structuredClone(s), n = advanceContract(s, action, (seed * 13 + turn * 7) % 100);
    assert.deepEqual(s, prior, 'engine input is immutable');
    assert.ok(n); s = n.state; status = n.status;
    assert.ok(s.health >= 0 && s.health <= s.max_health && s.depth <= contractLength(s));
    if (status === 'completed') {
      clears++; const side = contractSideProgress(s);
      assert.equal(n.rank_points, (40 + s.salvage + s.wins * 5) * s.tier + (side?.reached ? 60 * s.tier : 0));
    }
    if (status === 'failed') { failures++; assert.equal(n.rank_points, 0); }
  }
}
assert.ok(clears && failures && drafts);
assert.ok(fieldDecisions > 0);
assert.equal(fieldActionsSeen.size, 7, 'simulations exercise both decisions in all three encounters and leave');

// One optional field decision per checkpoint; previews are exact, all trades
// stay within this contract, and neither forged effects nor repeat clicks apply.
const fieldEffects = {
  field_buy_supplies: { health: 0, supplies: 2, salvage: -18 },
  field_sell_supplies: { health: 0, supplies: -2, salvage: 16 },
  field_aid: { health: 18, supplies: -1, salvage: 0 },
  field_detour: { health: -10, supplies: 0, salvage: 14 },
  field_recover: { health: 0, supplies: -1, salvage: 18 },
  field_repair: { health: 22, supplies: 0, salvage: -14 },
  field_leave: { health: 0, supplies: 0, salvage: 0 },
};
const encountered = new Set();
for (let seed = 0; seed < 30; seed++) {
  let s = createContractState('salvage', 'scavenger', 1, 'field-' + seed);
  assert.equal(contractFieldEncounter(s), null);
  assert.equal(advanceContract(s, 'field_leave', 0), null);
  for (let i = 0; i < 2; i++) s = advanceContract(s, 'search', 0).state;
  assert.equal(contractFieldEncounter(s), null, 'draft selection comes first');
  assert.equal(advanceContract(s, 'field_leave', 0), null);
  s = { ...advanceContract(s, 'supply_cache', 0).state, health: 40, supplies: 5, salvage: 50 };
  const offer = contractFieldEncounter(s); encountered.add(offer.key);
  assert.equal(offer.checkpoint, 2); assert.equal(offer.choices.length, 3);
  for (const choice of offer.choices) {
    const before = structuredClone(s), next = advanceContract(s, choice.key, 99);
    assert.deepEqual(s, before);
    assert.deepEqual(choice.delta, fieldEffects[choice.key]);
    assert.equal(next.status, 'active'); assert.equal(next.rank_points, 0);
    for (const [key, delta] of Object.entries(choice.delta)) assert.equal(next.state[key], s[key] + delta);
    for (const key of ['depth', 'wins', 'route_wins', 'path', 'path_offer', 'preparation', 'perks', 'draft', 'boss_result']) assert.deepEqual(next.state[key], s[key]);
    assert.equal(contractFieldEncounter(next.state), null);
    assert.equal(advanceContract(next.state, choice.key, 0), null);
    assert.deepEqual(next.state.field_result.delta, choice.delta);
  }
  const unavailable = contractFieldEncounter({ ...s, health: s.max_health, supplies: 0, salvage: 0 });
  for (const choice of unavailable.choices) if (choice.key !== 'field_detour' && choice.key !== 'field_leave') {
    assert.equal(choice.disabled, true);
    assert.equal(advanceContract({ ...s, health: s.max_health, supplies: 0, salvage: 0 }, choice.key, 0), null);
  }
  for (const choice of contractFieldEncounter({ ...s, health: s.max_health - 3 }).choices.filter((c) => c.delta.health > 0)) {
    assert.equal(choice.delta.health, 3, 'healing preview is the actual capped gain');
    assert.equal(advanceContract({ ...s, health: s.max_health - 3 }, choice.key, 0).state.health, s.max_health);
  }
  if (offer.key === 'medic') {
    assert.equal(advanceContract({ ...s, health: 10 }, 'field_detour', 0), null, 'a field trade cannot kill the run');
    assert.equal(advanceContract({ ...s, health: 11 }, 'field_detour', 0).state.health, 1);
  }
  for (const key of Object.keys(fieldEffects).filter((key) => !offer.choices.some((c) => c.key === key))) assert.equal(advanceContract(s, key, 0), null);
  const skipped = advanceContract(s, 'cover', 0).state;
  assert.equal(skipped.field_pending, false); assert.equal(contractFieldEncounter(skipped), null);
  assert.equal(advanceContract(skipped, 'field_leave', 0), null);
  for (const version of [1, 2, 3, 4, 5, 6, 7, 8]) {
    assert.equal(contractFieldEncounter({ ...s, version }), null);
    assert.equal(advanceContract({ ...s, version }, offer.choices[0].key, 0), null);
  }
}
assert.equal(encountered.size, 3);
// Skipping encounters preserves v8 rooms, goals, boss, payouts and rank exactly.
for (const format of ['standard', 'extended']) {
  let modern = createContractState('escort', 'bruiser', 1, 'field-compatible', 'none', format);
  let old = { ...modern, version: 8 }; delete old.field_pending; delete old.field_result;
  while (modern.depth < contractLength(modern)) {
    const choice = modern.draft.length ? modern.draft[0] : 'cover';
    const a = advanceContract(modern, choice, 0), b = advanceContract(old, choice, 0);
    assert.equal(a.status, b.status); assert.equal(a.rank_points, b.rank_points);
    modern = a.state; old = b.state;
    const { version: v1, field_pending: pending, field_result: result, ...newState } = modern;
    const { version: v2, ...oldState } = old;
    assert.deepEqual(newState, oldState);
  }
}
for (const invalid of [null, '__proto__', 'marathon', ['extended'], {}, 10]) assert.equal(createContractState('escort', 'scout', 1, 'x', 'none', invalid), null);

// Every setup is completable; new objectives require the named actions/resources,
// and reaching the target before the final room never pays early.
for (const format of Object.keys(CONTRACT_FORMATS)) for (const goal of Object.keys(CONTRACT_GOALS)) for (const build of ['scout', 'bruiser', 'scavenger']) for (const tier of [1, 2, 3]) {
  let state = createContractState(goal, build, tier, 'complete-setup', 'none', format), result, checkpointCount = 0;
  const rooms = contractLength(state);
  while (state.depth < rooms) {
    if (state.draft.length) {
      checkpointCount++;
      state = advanceContract(state, 'supply_cache', 0).state;
    }
    const choice = goal === 'breach' ? 'bold' : ['recon', 'resupply', 'salvage'].includes(goal) ? 'search' : 'cover';
    result = advanceContract(state, choice, 0); state = result.state;
    if (state.depth < rooms) { assert.equal(result.status, 'active'); assert.equal(result.rank_points, 0); }
  }
  assert.equal(result.status, 'completed', `${format}/${goal}/${build}/${tier}`);
  assert.equal(checkpointCount, format === 'extended' ? 4 : 2);
  assert.equal(advanceContract(state, 'cover', 0), null);
}
for (const goal of ['breach', 'recon', 'resupply']) {
  const state = { ...createContractState(goal, 'bruiser', 1, 'missed-goal'), depth: 5, wins: 5, salvage: 200 };
  assert.equal(advanceContract(state, 'cover', 0).status, 'failed', `${goal} cannot be completed by unrelated successes`);
}
const lastLongDraft = { ...createContractState('escort', 'bruiser', 1, 'last-draft', 'none', 'extended'), depth: 8, salvage: 100, perks: ['shield', 'radar', 'boots'], draft: ['medkit', 'pockets', 'magnet'] };
assert.deepEqual(contractDraftActions(lastLongDraft), [], 'a late draft cannot promise nonexistent replacement perks');
assert.equal(advanceContract(lastLongDraft, 'redraw_draft', 0), null);
assert.equal(advanceContract(lastLongDraft, 'supply_cache', 0).state.depth, 8);
for (const version of [1, 2, 3, 4, 5]) {
  const old = { ...createContractState('scout', 'scout', 1, 'old-format', 'none', 'extended'), version, depth: 5, wins: 4 };
  assert.equal(contractLength(old), 6, 'legacy versions ignore new format data');
  assert.equal(contractObjective(old).target, 4);
  assert.equal(advanceContract(old, 'cover', 0).status, 'completed');
}
assert.equal(createContractState('__proto__', 'scout', 1, 'x'), null);
assert.equal(createContractState('escort', 'scout', 4, 'x'), null);
assert.equal(advanceContract(createContractState('escort', 'scout', 1, 'x'), 'rest', 0), null);
assert.equal(createContractState('escort', 'scout', 1, 'x', '__proto__'), null);
for (const invalid of [null, ['versatile'], { toString: 'versatile' }, 1]) assert.equal(createContractState('escort', 'scout', 1, 'x', invalid), null);

// Checkpoint paths use their actual previews, last two room advances, and cannot
// be chosen again or smuggled into legacy saves. Rest consumes their duration.
let checkpoint = createContractState('salvage', 'scavenger', 3, 'paths');
assert.equal(advanceContract(checkpoint, 'path_hazard', 0), null);
for (let room = 0; room < 2; room++) checkpoint = advanceContract(checkpoint, 'search', 0).state;
assert.deepEqual(contractPathChoices(checkpoint), [], 'choose an upgrade before planning the path');
assert.equal(advanceContract(checkpoint, 'path_quiet', 0), null);
checkpoint = advanceContract(checkpoint, 'supply_cache', 0).state;
assert.equal(contractPathChoices(checkpoint).length, 3);
for (const [key, odds, salvage, damage] of [['path_quiet', 8, -5, -4], ['path_hazard', -8, 10, 4], ['path_steady', 0, 0, 0]]) {
  const selected = advanceContract(checkpoint, key, 0), s = selected.state;
  assert.equal(selected.rank_points, 0); assert.equal(s.depth, 2);
  assert.equal(s.health, checkpoint.health); assert.equal(s.supplies, checkpoint.supplies); assert.equal(s.salvage, checkpoint.salvage);
  assert.deepEqual(contractPathChoices(s), []); assert.equal(advanceContract(s, key, 0), null);
  for (const baseline of contractChoices(checkpoint).filter((choice) => choice.key !== 'rest')) {
    const preview = contractChoices(s).find((choice) => choice.key === baseline.key);
    assert.equal(preview.odds, Math.max(30, Math.min(98, baseline.odds + odds)));
    assert.equal(preview.salvage, baseline.salvage + salvage); assert.equal(preview.damage, baseline.damage + damage);
    const win = advanceContract(s, preview.key, preview.odds - 1).state;
    const loss = advanceContract(s, preview.key, preview.odds).state;
    assert.equal(win.salvage - s.salvage, preview.salvage); assert.equal(s.health - loss.health, preview.damage);
    assert.equal(win.path.remaining, 1);
    const second = advanceContract(win, 'cover', 0).state;
    assert.equal(second.path, null); assert.equal(second.path_offer, true); assert.ok(second.draft.length);
  }
  assert.equal(advanceContract({ ...s, health: 40 }, 'rest', 0).state.path.remaining, 1);
  const prepared = advanceContract(s, 'prepare_scout', 0).state;
  assert.equal(prepared.path.remaining, 2); assert.equal(prepared.depth, 2);
}
const skipped = advanceContract(checkpoint, 'cover', 0).state;
assert.equal(skipped.path_offer, false); assert.equal(skipped.path, null); assert.equal(advanceContract(skipped, 'path_quiet', 0), null);
for (const version of [1, 2, 3, 4, 5, 6]) {
  const old = { ...checkpoint, version };
  assert.deepEqual(contractPathChoices(old), []); assert.equal(advanceContract(old, 'path_hazard', 0), null);
  assert.deepEqual(contractChoices({ ...old, path: { key: 'path_hazard', remaining: 2 } }), contractChoices(old));
}
// v6 and a v7 run that skips paths have identical outcomes and rank in both formats.
for (const format of ['standard', 'extended']) {
  let modern = { ...createContractState('escort', 'bruiser', 1, 'compatible', 'none', format), version: 7 }, old = { ...modern, version: 6 };
  while (modern.depth < contractLength(modern)) {
    const choice = modern.draft.length ? modern.draft[0] : 'cover';
    const a = advanceContract(modern, choice, 0), b = advanceContract(old, choice, 0);
    assert.equal(a.status, b.status); assert.equal(a.rank_points, b.rank_points);
    modern = a.state; old = b.state;
    const { version: v1, path: p1, path_offer: o1, ...aState } = modern;
    const { version: v2, path: p2, path_offer: o2, ...bState } = old;
    assert.deepEqual(aState, bState);
  }
}

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

// All three finales are real mechanics. A boss clear alone is insufficient;
// both the main goal and successful final route are required for v8 completion.
const bossKeys = new Set();
for (const format of ['standard', 'extended']) for (const goal of Object.keys(CONTRACT_GOALS)) for (const tier of [1, 2, 3]) {
  const initial = createContractState(goal, 'scavenger', tier, 'finale-' + goal, 'none', format);
  const state = { ...initial, depth: contractLength(initial) - 1, health: 90, wins: 9, salvage: 200, supplies: 10, route_wins: { cover: 3, bold: 6, search: 6 } };
  const boss = contractBoss(state); bossKeys.add(boss.key);
  assert.equal(contractRoom(state).title, boss.title);
  assert.equal(advanceContract({ ...state, health: 40 }, 'rest', 0), null, 'rest cannot skip the boss');
  assert.ok(contractChoices({ ...state, health: 40 }).find((c) => c.key === 'rest').disabled);
  for (const choice of contractChoices(state).filter((c) => c.key !== 'rest')) {
    assert.equal(choice.title, boss.tactics[choice.key]);
    const win = advanceContract(state, choice.key, choice.odds - 1);
    const loss = advanceContract(state, choice.key, choice.odds);
    assert.equal(win.status, 'completed'); assert.equal(win.state.boss_result.cleared, true);
    assert.equal(win.state.salvage - state.salvage, choice.salvage);
    assert.equal(loss.state.health, state.health - choice.damage);
    assert.equal(loss.status, 'failed'); assert.equal(loss.rank_points, 0); assert.equal(loss.state.boss_result.cleared, false);
    assert.equal(advanceContract(win.state, choice.key, 0), null);
    for (const path of ['path_quiet', 'path_hazard', 'path_steady']) {
      const prepared = advanceContract({ ...state, path: { key: path, remaining: 1 } }, 'prepare_scout', 0).state;
      const preview = contractChoices(prepared).find((c) => c.key === choice.key);
      const resolved = advanceContract(prepared, choice.key, preview.odds - 1);
      assert.equal(resolved.status, 'completed'); assert.equal(resolved.state.salvage - prepared.salvage, preview.salvage);
      assert.equal(resolved.state.path, null);
    }
  }
  for (const version of [1, 2, 3, 4, 5, 6, 7]) {
    const old = { ...state, version, goal: 'escort', depth: version < 6 ? 5 : state.depth, boss_result: null };
    assert.equal(contractBoss(old), null); assert.equal(contractRoom(old).title, 'Courier Checkpoint');
    const oldChoice = contractChoices(old).find((c) => c.key === 'cover');
    assert.equal(advanceContract(old, 'cover', oldChoice.odds).status, 'completed', 'old saves may survive a last-room setback and still finish');
    assert.equal(advanceContract({ ...old, health: 40 }, 'rest', 0).status, 'completed', 'old saves keep final-room rest');
  }
}
assert.equal(bossKeys.size, 3);
const missedBossGoal = { ...createContractState('breach', 'scout', 1, 'missed-boss-goal'), depth: 5, health: 90 };
const clearedButMissed = advanceContract(missedBossGoal, 'search', 0);
assert.equal(clearedButMissed.state.boss_result.cleared, true); assert.equal(clearedButMissed.status, 'failed'); assert.equal(clearedButMissed.rank_points, 0);

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
const supplyDraft = { ...createContractState('escort', 'scavenger', 1, 'supply-choice', 'stocked'), depth: 2, draft: ['shield', 'radar', 'boots'] };
const supplyBefore = structuredClone(supplyDraft);
const supplied = advanceContract(supplyDraft, 'supply_cache', 0);
assert.deepEqual(supplyDraft, supplyBefore, 'a draft choice must not mutate the supplied state');
assert.equal(supplied.state.supplies, supplyBefore.supplies + 2);
assert.equal(supplied.state.depth, supplyBefore.depth); assert.deepEqual(supplied.state.perks, supplyBefore.perks);
assert.deepEqual(supplied.state.draft, []); assert.equal(supplied.rank_points, 0);
assert.equal(contractSideProgress(supplied.state).reached, true, 'supplies may satisfy Well Supplied but rank waits for completion');
assert.equal(advanceContract(supplied.state, 'supply_cache', 0), null, 'the same draft cannot grant supplies again');
assert.equal(advanceContract(supplied.state, 'shield', 0), null, 'taking supplies consumes the upgrade offer');
for (const version of [1, 2, 3]) assert.equal(advanceContract({ ...supplyDraft, version }, 'supply_cache', 0), null, 'saved old versions keep their draft rules');
assert.equal(advanceContract(createContractState('escort', 'scout', 1, 'no-draft'), 'supply_cache', 0), null);
const failedMain = advanceContract({ ...createContractState('scout', 'bruiser', 1, 'fail-main', 'daredevil'), depth: 5, wins: 2, route_wins: { cover: 0, bold: 2, search: 0 } }, 'bold', 0);
assert.equal(contractSideProgress(failedMain.state).reached, true);
assert.equal(failedMain.status, 'failed'); assert.equal(failedMain.rank_points, 0);

const redrawState = { ...supplyDraft, salvage: 65 };
const redrawn = advanceContract(redrawState, 'redraw_draft', 0);
assert.equal(redrawn.state.salvage,50); assert.equal(redrawn.state.depth,2);
assert.equal(redrawn.rank_points,0); assert.equal(redrawn.state.supplies,redrawState.supplies);
assert.equal(redrawn.state.draft.length,3);
assert.ok(redrawn.state.draft.every((key) => !redrawState.draft.includes(key)));
assert.deepEqual(redrawn.state.perks,redrawState.perks);
assert.equal(advanceContract(redrawn.state,'redraw_draft',0),null);
assert.equal(advanceContract(redrawn.state,'shield',0),null,'old offers cannot be picked after redraw');
assert.equal(advanceContract({ ...redrawState, salvage: 14 },'redraw_draft',0),null);
assert.equal(advanceContract({ ...redrawState, salvage: 15 },'redraw_draft',0).state.salvage,0);
assert.equal(advanceContract({ ...redrawState, draft: [] },'redraw_draft',0),null);
for (const version of [1,2,3,4]) {
  assert.deepEqual(contractDraftActions({ ...redrawState, version }),[]);
  assert.equal(advanceContract({ ...redrawState, version },'redraw_draft',0),null);
}
let secondDraft = advanceContract(redrawn.state,'medkit',0).state;
secondDraft = advanceContract(secondDraft,'cover',0).state;
secondDraft = advanceContract(secondDraft,'cover',0).state;
assert.equal(secondDraft.depth,4); assert.equal(secondDraft.draft_redrawn,false);
const secondRedraw = advanceContract(secondDraft,'redraw_draft',0);
assert.equal(secondRedraw.state.draft.length,2,'second checkpoint excludes owned and currently offered perks');
assert.ok(secondRedraw.state.draft.every((key) => !secondDraft.draft.includes(key) && !secondDraft.perks.includes(key)));
assert.equal(advanceContract(secondRedraw.state,'supply_cache',0).state.supplies,secondRedraw.state.supplies+2);

assert.equal((await board(egg)).available, false);
assert.equal((await act(egg, { action: 'contract_start' })).accepted, false);
assert.equal((await act(a, { action: 'contract_start', pet_id: b.pet_id })).accepted, false);
assert.equal((await act(a, { action: 'contract_start', sequence: 1, goal: 'escort', build: 'bruiser', tier: 2 })).accepted, false);

// Deterministic test-only RNG. No HTTP request can supply this server entropy.
const realCrypto = globalThis.crypto;
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: realCrypto.subtle, randomUUID: () => realCrypto.randomUUID(), getRandomValues: (values) => { values.fill(0); return values; } } });
try {
  const supplyPet = await seed('contract-supply-draft');
  await start(supplyPet);
  for (let i = 0; i < 2; i++) {
    const r = (await board(supplyPet)).run;
    assert.equal((await act(supplyPet, { action: 'contract_step', contract_id: r.contract_id, revision: r.revision, choice: 'bold' })).accepted, true);
  }
  const firstDraft = (await board(supplyPet)).run;
  const redrawRequest = { action: 'contract_step', contract_id: firstDraft.contract_id, revision: firstDraft.revision, choice: 'redraw_draft' };
  const redrawRace = await Promise.all([act(supplyPet,redrawRequest),act(supplyPet,redrawRequest)]);
  assert.equal(redrawRace.filter((r) => r.accepted).length,1);
  const offer = (await board(supplyPet)).run;
  assert.equal(offer.salvage,firstDraft.salvage-15); assert.equal(offer.depth,firstDraft.depth);
  assert.deepEqual(offer.draft_actions,[],'saved redraw cannot be charged again');
  assert.ok(offer.choices.filter((c) => c.key !== 'supply_cache').every((c) => !firstDraft.choices.some((old) => old.key === c.key)));
  assert.equal(offer.choices.some((c) => c.key === 'supply_cache'), true);
  const takeSupply = { action: 'contract_step', contract_id: offer.contract_id, revision: offer.revision, choice: 'supply_cache', supplies: 999999 };
  const supplyRace = await Promise.all([act(supplyPet, takeSupply), act(supplyPet, takeSupply)]);
  assert.equal(supplyRace.filter((r) => r.accepted).length, 1);
  const savedSupply = (await board(supplyPet)).run;
  assert.equal(savedSupply.supplies, offer.supplies + 2); assert.equal(savedSupply.depth, offer.depth);
  assert.equal(savedSupply.perks.length, 0); assert.equal(savedSupply.choices.some((c) => c.upgrade), false);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_contract'").get(supplyPet.telegram_id).n, 0);
  assert.equal(sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(supplyPet.pet_id).energy, 0);
  // Two tabs cannot choose different paths at the same checkpoint. Client path
  // duration, modifiers and rewards cannot override the server's saved choice.
  assert.equal(savedSupply.path_choices.length, 3);
  const pathRequest = { action: 'contract_step', contract_id: savedSupply.contract_id, revision: savedSupply.revision, choice: 'path_hazard', path: { remaining: 999, salvage: 9999 }, reward_xp: 9999 };
  const pathRace = await Promise.all([act(supplyPet, pathRequest), act(supplyPet, { ...pathRequest, choice: 'path_quiet' })]);
  assert.equal(pathRace.filter((r) => r.accepted).length, 1);
  const savedPath = (await board(supplyPet)).run;
  assert.equal(savedPath.path.key, 'path_hazard'); assert.equal(savedPath.path.remaining, 2);
  assert.equal(savedPath.depth, savedSupply.depth); assert.equal(savedPath.salvage, savedSupply.salvage);
  assert.equal(savedPath.path_choices.length, 0); assert.equal((await board(supplyPet)).bonus_remaining, 3);
  assert.equal((await act(supplyPet, { ...pathRequest, revision: savedPath.revision })).accepted, false);
  assert.equal((await act(b, pathRequest)).accepted, false);
  assert.deepEqual((await board(supplyPet)).run.path, savedPath.path, 'reload projects the saved path');
  const fieldOffer = savedPath.field_encounter;
  assert.ok(fieldOffer);
  const fieldChoice = fieldOffer.choices.find((choice) => !choice.disabled && choice.key !== 'field_leave');
  const fieldWallet = sqlite.prepare('SELECT pet_xp, moon_gold, moon_crystals, style_tokens, energy FROM telegram_pet_profiles WHERE telegram_id=?').get(supplyPet.telegram_id);
  const fieldRequest = { action: 'contract_step', contract_id: savedPath.contract_id, revision: savedPath.revision, choice: fieldChoice.key, field_pending: true, delta: { salvage: 99999, health: 99999 }, reward_xp: 99999 };
  assert.equal((await act(b, fieldRequest)).accepted, false);
  const fieldRace = await Promise.all([act(supplyPet, fieldRequest), act(supplyPet, { ...fieldRequest, choice: 'field_leave' })]);
  assert.equal(fieldRace.filter((result) => result.accepted).length, 1);
  const savedField = (await board(supplyPet)).run;
  assert.equal(savedField.field_encounter, null);
  for (const [key, delta] of Object.entries(fieldChoice.delta)) assert.equal(savedField[key], savedPath[key] + delta);
  assert.equal(savedField.depth, savedPath.depth); assert.deepEqual(savedField.path, savedPath.path);
  assert.equal(savedField.field_result.choice, fieldChoice.key);
  assert.deepEqual((await board(supplyPet)).run.field_result, savedField.field_result, 'field receipt survives reload');
  assert.equal((await act(supplyPet, fieldRequest)).accepted, false, 'stale retry cannot pay twice');
  assert.equal((await act(supplyPet, { ...fieldRequest, revision: savedField.revision })).accepted, false, 'fresh revision cannot reopen the encounter');
  assert.deepEqual(sqlite.prepare('SELECT pet_xp, moon_gold, moon_crystals, style_tokens, energy FROM telegram_pet_profiles WHERE telegram_id=?').get(supplyPet.telegram_id), fieldWallet);
  assert.equal((await board(supplyPet)).bonus_remaining, 3);
  const bossPet = await seed('contract-boss-authority');
  await start(bossPet);
  let bossRun = (await board(bossPet)).run;
  const bossState = { ...createContractState('escort', 'bruiser', 1, 'saved-boss'), depth: 5, health: 100, wins: 5 };
  sqlite.prepare('UPDATE telegram_pet_contracts SET state_json=? WHERE contract_id=?').run(JSON.stringify(bossState), bossRun.contract_id);
  bossRun = (await board(bossPet)).run;
  assert.equal(bossRun.boss.active, true); assert.equal(bossRun.boss.title, 'SHIELD WARDEN');
  const bossMove = { action: 'contract_step', contract_id: bossRun.contract_id, revision: bossRun.revision, choice: 'cover', boss_result: { cleared: false }, boss: 'hound', rank_points: 9999 };
  const bossRace = await Promise.all([act(bossPet, bossMove), act(bossPet, bossMove)]);
  assert.equal(bossRace.filter((r) => r.accepted).length, 1);
  const bossFinish = (await board(bossPet)).run;
  assert.equal(bossFinish.status, 'completed'); assert.equal(bossFinish.boss.result.cleared, true); assert.equal(bossFinish.boss.result.key, 'warden');
  assert.equal(bossFinish.xp_awarded, 20); assert.equal((await board(bossPet)).bonus_remaining, 2);
  assert.equal((await act(bossPet, { action: 'contract_claim', contract_id: bossRun.contract_id })).pet_xp_awarded, 0);
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
  assert.equal(capped.collection.total_routes, 108);
  assert.equal(capped.collection.unlocked_routes, 72);
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

  // A completed reservation belongs to its earning pet, even with an egg active.
  const sourcePet = await seed('contract-saved-owner');
  await start(sourcePet);
  const savedBonus = await complete(sourcePet, async () => { throw Error('delivery offline'); });
  const eggId = sourcePet.pet_id + ':egg';
  sqlite.prepare(`INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type,source_event_key,arcade_xp_spent,status) VALUES (?,?,?,2,'arcade_xp','saved-claim-test',0,'active')`).run(eggId,sourcePet.telegram_id,sourcePet.season_key);
  sqlite.prepare(`INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,stage,source_profile_updated_at) VALUES (?,?,?,2,'egg',CURRENT_TIMESTAMP)`).run(eggId,sourcePet.telegram_id,sourcePet.season_key);
  sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json) VALUES (?,?,'saved-claim-egg','egg','{}','[]')`).run(eggId,sourcePet.telegram_id);
  assert.equal((await hooks.switchActivePetSeasonSlot(db,sourcePet.telegram_id,eggId)).accepted,true);
  const activeEgg = { ...sourcePet, pet_id: eggId, stage: 'egg' };
  const savedBoard = await board(activeEgg);
  assert.equal(savedBoard.available, false);
  assert.ok(savedBoard.pending_rewards?.some((entry) => entry.contract_id === savedBonus.contract_id && entry.pet_id === sourcePet.pet_id), 'saved bonus remains visible after switching to an egg');
  const originalXp = sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet.pet_id).pet_xp;
  const eggXp = sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(eggId).pet_xp;
  const savedClaim = { action:'contract_claim',pet_id:sourcePet.pet_id,contract_id:savedBonus.contract_id };
  const dispatchClaim = () => hooks.processPetMiniAppAction(db,sourcePet.telegram_id,{id:sourcePet.telegram_id},{...savedClaim,request_id:realCrypto.randomUUID()},'fixture-token');
  assert.equal((await dispatchClaim()).pet_xp_awarded,20);
  assert.equal((await dispatchClaim()).pet_xp_awarded,0);
  assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(sourcePet.pet_id).pet_xp,originalXp+20);
  assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(eggId).pet_xp,eggXp);
  assert.equal(sqlite.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(sourcePet.telegram_id).pet_id,eggId);
  assert.deepEqual((await board(activeEgg)).pending_rewards,[]);
  assert.equal((await act(activeEgg,{...savedClaim,pet_id:eggId})).accepted,false,'claim cannot be redirected to the active egg');
  assert.equal((await act(b,savedClaim)).accepted,false,'another owner cannot claim a saved bonus');
  assert.equal((await start(sourcePet)).accepted,false,'recovery does not reopen old-pet gameplay');

  // Real season rollover: old earned XP remains recoverable with a fresh egg.
  const oldTime = new Date(Date.UTC(now.getUTCFullYear()-1,0,15));
  const oldPet = await seed('contract-rollover','young',oldTime);
  await start(oldPet,'escort',oldTime);
  const oldBonus = await complete(oldPet,async () => { throw Error('delivery offline'); },oldTime);
  assert.equal(await hooks.preparePetMiniAppState(db,oldPet.telegram_id,now),true);
  const newPet = await hooks.ensureActivePetInstance(db,oldPet.telegram_id);
  assert.notEqual(newPet.pet_id,oldPet.pet_id);
  sqlite.prepare("UPDATE telegram_pet_instances SET status='archived' WHERE pet_id=?").run(oldPet.pet_id);
  sqlite.prepare("UPDATE telegram_pet_season_slots SET status='archived' WHERE pet_id=?").run(oldPet.pet_id);
  const oldClaim = { action:'contract_claim',pet_id:oldPet.pet_id,contract_id:oldBonus.contract_id,season_key:newPet.season_key,reward_xp:999999 };
  const oldRequest = () => act(newPet,oldClaim);
  assert.equal((await board(newPet)).pending_rewards[0].season_key,oldPet.season_key);
  const beforeOld = sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(oldPet.pet_id).pet_xp;
  // Legacy malformed reservations must not fill the inbox ahead of valid ones.
  sqlite.exec('PRAGMA foreign_keys=OFF');
  for (let i=0;i<12;i++) sqlite.prepare(`INSERT INTO telegram_pet_contracts
    (contract_id,pet_id,telegram_id,season_key,sequence,status,state_json,reward_xp,reward_day)
    VALUES (?,?,?,?,1,'completed','{}',20,'2000-01-01')`).run('orphan-bonus-'+i,'missing-pet-'+i,oldPet.telegram_id,oldPet.season_key);
  sqlite.exec('PRAGMA foreign_keys=ON');
  assert.deepEqual((await board(newPet)).pending_rewards.map((entry) => entry.contract_id),[oldBonus.contract_id]);
  assert.equal((await act(newPet,{action:'contract_claim',pet_id:'missing-pet-0',contract_id:'orphan-bonus-0'})).accepted,false);
  // Recheck source authority inside the award transaction, after the claim read.
  beforeBatch = (statements) => {
    if (!statements[0].args.includes('pet_contract')) return;
    beforeBatch = null;
    sqlite.exec('PRAGMA foreign_keys=OFF');
    sqlite.prepare('UPDATE telegram_pet_season_slots SET slot_number=2 WHERE pet_id=?').run(oldPet.pet_id);
    sqlite.exec('PRAGMA foreign_keys=ON');
  };
  assert.equal((await oldRequest()).pet_xp_awarded,0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_contract'").get(oldPet.telegram_id).n,0);
  assert.deepEqual((await board(newPet)).pending_rewards,[],'mismatched source slot is hidden');
  assert.equal((await oldRequest()).accepted,false);
  sqlite.exec('PRAGMA foreign_keys=OFF');
  sqlite.prepare('UPDATE telegram_pet_season_slots SET slot_number=1 WHERE pet_id=?').run(oldPet.pet_id);
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const change of ["status='active'","reward_xp=0"]) {
    sqlite.prepare('UPDATE telegram_pet_contracts SET '+change+' WHERE contract_id=?').run(oldBonus.contract_id);
    assert.equal((await oldRequest()).accepted,false,'only completed reserved bonuses are claimable');
    sqlite.prepare("UPDATE telegram_pet_contracts SET status='completed',reward_xp=20 WHERE contract_id=?").run(oldBonus.contract_id);
  }
  const recoveredTogether = await Promise.all([oldRequest(),oldRequest()]);
  assert.equal(recoveredTogether.reduce((sum,result) => sum+result.pet_xp_awarded,0),20,'parallel claims pay once');
  assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(oldPet.pet_id).pet_xp,beforeOld+20);
  assert.equal(sqlite.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(newPet.pet_id).pet_xp,newPet.pet_xp);
  const oldEvent = sqlite.prepare("SELECT season_key,pet_id FROM telegram_pet_events WHERE telegram_id=? AND event_type='contract_complete'").get(oldPet.telegram_id);
  assert.equal(oldEvent.season_key,oldPet.season_key); assert.equal(oldEvent.pet_id,oldPet.pet_id);
  assert.equal(sqlite.prepare('SELECT reward_day FROM telegram_pet_contracts WHERE contract_id=?').get(oldBonus.contract_id).reward_day,oldTime.toISOString().slice(0,10));
  sqlite.prepare('UPDATE telegram_pet_contracts SET reward_settled=0,xp_awarded=0 WHERE contract_id=?').run(oldBonus.contract_id);
  assert.equal((await oldRequest()).pet_xp_awarded,0,'post-payment receipt recovery never pays twice');
  assert.equal(sqlite.prepare('SELECT xp_awarded FROM telegram_pet_contracts WHERE contract_id=?').get(oldBonus.contract_id).xp_awarded,20);
  assert.deepEqual((await board(newPet)).pending_rewards,[]);
  assert.equal((await start(oldPet,'escort',oldTime)).accepted,false);

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

  // Format and progress are saved by the dispatcher, never accepted from moves.
  const longPet = await seed('long-contract');
  const longStart = { action: 'contract_start', pet_id: longPet.pet_id, sequence: 1, goal: 'recon', build: 'scavenger', tier: 1, format: 'extended', max_depth: 1, target: 0, version: 1 };
  assert.equal((await hooks.processPetMiniAppAction(db, longPet.telegram_id, { id:longPet.telegram_id }, { ...longStart, request_id:realCrypto.randomUUID() }, 'fixture-token')).accepted, true);
  let longRun = (await board(longPet)).run;
  assert.equal(longRun.max_depth, 10); assert.equal(longRun.target, 5); assert.equal(longRun.format, 'extended');
  while (longRun.depth < 6) {
    const choice = longRun.choices.some((c) => c.key === 'search') ? 'search' : 'supply_cache';
    await act(longPet, { action:'contract_step', contract_id:longRun.contract_id, revision:longRun.revision, choice, format:'standard', target:0, max_depth:6, route_wins:{ search:1000 } });
    longRun = (await board(longPet)).run;
  }
  assert.equal(longRun.status, 'active'); assert.equal(longRun.progress, 6);
  assert.equal(longRun.max_depth, 10); assert.equal(longRun.target, 5);
  assert.equal((await board(longPet)).bonus_remaining, 3, 'long routes cannot reserve a reward at the old finish');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_contract'").get(longPet.telegram_id).n, 0);
  const longFinished = await complete(longPet);
  assert.equal(longFinished.status, 'completed'); assert.equal(longFinished.depth, 10); assert.equal(longFinished.xp_awarded, 20);
  assert.equal((await act(longPet, { action:'contract_claim', contract_id:longFinished.contract_id })).pet_xp_awarded, 0);
  let longBoard = await board(longPet);
  assert.equal(longBoard.collection.records.find((r) => r.key === 'recon:scavenger:1:extended').completed, 1);
  assert.equal(longBoard.collection.records.find((r) => r.key === 'recon:scavenger:1').completed, 0);
  assert.equal((await act(longPet, { ...longStart, sequence:2, format:'__proto__' })).accepted, false);
  await act(longPet, { ...longStart, sequence:2, format:'standard' }); await complete(longPet);
  longBoard = await board(longPet);
  assert.equal(longBoard.collection.cleared_routes, 2);
  assert.equal(longBoard.collection.records.find((r) => r.key === 'recon:scavenger:1').completed, 1);
  assert.equal(longBoard.bonus_remaining, 1, 'formats share the same existing daily bonus budget');
  assert.equal(sqlite.prepare('SELECT energy FROM telegram_pet_instances WHERE pet_id=?').get(longPet.pet_id).energy, 0);
  sqlite.exec('DROP TABLE telegram_pet_contracts');
  await assert.rejects(hooks.buildPetMiniAppState(db, b.telegram_id, 'fixture-token'), /no such table: telegram_pet_contracts/,
    'a missing live Contract authority table must fail the state refresh instead of publishing false unavailability');
  const blocked = await hooks.processPetMiniAppAction(db, b.telegram_id, { id:b.telegram_id }, { action:'contract_start',pet_id:b.pet_id,sequence:1,goal:'escort',build:'bruiser',tier:1,request_id:realCrypto.randomUUID() }, 'fixture-token');
  assert.equal(blocked.reason, 'contracts_unavailable');
  sqlite.exec(migration); sqlite.exec(migration);
} finally { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: realCrypto }); sqlite.close(); }
console.log(`Continuing contract tests passed: 4320 simulated runs (${clears} goals met, ${failures} failures, ${drafts} drafts, ${fieldDecisions} field decisions), all 108 setups completable, legacy formats, SQLite authority/concurrency/reward recovery, and actual Mini App dispatch.`);

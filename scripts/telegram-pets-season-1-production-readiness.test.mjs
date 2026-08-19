import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');

const {
  buildPetMiniAppCapabilities,
  buildPetMiniAppState,
  ensureActivePetInstance,
  ensurePetStarterSeasonSlot,
  getPetMiniAppCombatEligibility,
  getPetSeasonInfo,
  processPetMiniAppAction,
} = __petMediaTestHooks;

class Statement {
  constructor(adapter, sql, args = []) { this.adapter = adapter; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.adapter, this.sql, args); }
  async first() { return this.adapter.database.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.adapter.database.prepare(this.sql).all(...this.args) }; }
  async run() {
    const result = this.adapter.database.prepare(this.sql).run(...this.args);
    return { results: [], meta: { changes: Number(result.changes || 0) } };
  }
}

class D1 {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.database.exec(schema);
    installSeasonCompletionMarkerTable(this);
  }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) {
        const result = this.database.prepare(statement.sql).run(...statement.args);
        results.push({ results: [], meta: { changes: Number(result.changes || 0) } });
      }
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function installSeasonCompletionMarkerTable(db) {
  db.database.exec(`CREATE TABLE IF NOT EXISTS telegram_pet_achievements (
    telegram_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    target INTEGER NOT NULL,
    unlocked_at DATETIME,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (telegram_id, achievement_id)
  );

  CREATE TABLE IF NOT EXISTS telegram_pet_season_completions (
    pet_id TEXT NOT NULL,
    telegram_id TEXT NOT NULL,
    season_key TEXT NOT NULL,
    completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    legendary_evolution_id TEXT NOT NULL,
    growth_marks_earned INTEGER NOT NULL,
    weekly_crests_earned INTEGER NOT NULL,
    authority_version INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (pet_id, season_key)
  )`);
}

function seedUser(db, telegramId, name = telegramId, xp = 1500) {
  db.database.prepare('INSERT OR IGNORE INTO telegram_users (telegram_id, first_name, xp, level) VALUES (?, ?, 0, 1)')
    .run(telegramId, name);
  db.database.prepare(`INSERT OR IGNORE INTO telegram_pet_profiles
    (telegram_id, pet_name, pet_xp, level, health, energy, happiness, cleanliness, moon_gold)
    VALUES (?, ?, ?, 20, 100, 100, 90, 90, 100)`).run(telegramId, name, xp);
}

function markSeasonComplete(db, telegramId, seasonKey = getPetSeasonInfo(new Date()).key) {
  db.database.prepare(`INSERT OR IGNORE INTO telegram_pet_season_completions
    (pet_id, telegram_id, season_key, completed_at, legendary_evolution_id, growth_marks_earned, weekly_crests_earned, authority_version)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'lunar_legend', 90, 13, 1)`)
    .run(`pet:${telegramId}:${seasonKey}:1`, telegramId, seasonKey);
}

async function setActivePetLifecyclePhase(db, telegramId, phase) {
  await ensurePetStarterSeasonSlot(db, telegramId);
  const pet = await ensureActivePetInstance(db, telegramId);
  db.database.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet
    (pet_id, telegram_id, identity_seed, phase, incubation_json, innate_traits_json)
    VALUES (?, ?, ?, ?, '{}', '[]')
    ON CONFLICT(pet_id) DO UPDATE SET phase=excluded.phase, updated_at=CURRENT_TIMESTAMP`)
    .run(pet.pet_id, telegramId, `readiness:${telegramId}:${phase}`, phase);
  db.database.prepare('UPDATE telegram_pet_instances SET stage=? WHERE pet_id=? AND telegram_id=?')
    .run(phase, pet.pet_id, telegramId);
  return pet;
}

async function act(db, telegramId, action, payload = {}) {
  return processPetMiniAppAction(db, telegramId, { id: telegramId, first_name: telegramId }, {
    action,
    request_id: `readiness:${telegramId}:${action}:${randomUUID()}`,
    ...payload,
  }, BOT_TOKEN);
}

function countCombatRows(db, telegramId) {
  return {
    arenaQueue: db.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_arena_queue WHERE telegram_id=?').get(telegramId).count,
    arenaBattles: db.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_arena_battles
      WHERE player1_telegram_id=? OR player2_telegram_id=?`).get(telegramId, telegramId).count,
    kaijuQueue: db.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_kaiju_queue WHERE telegram_id=?').get(telegramId).count,
    kaijuMatches: db.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_kaiju_matches
      WHERE player1_telegram_id=? OR player2_telegram_id=?`).get(telegramId, telegramId).count,
  };
}

function extractTestExport(source, name) {
  const startMarker = `// TEST-EXPORT: ${name}:start`;
  const endMarker = `// TEST-EXPORT: ${name}:end`;
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${name} test export must exist`);
  const bodyStart = source.indexOf('\n', start + startMarker.length);
  const end = source.indexOf(endMarker, bodyStart + 1);
  assert.notEqual(end, -1, `${name} test export must have an end marker`);
  return source.slice(bodyStart + 1, end);
}

function routeBlock(route) {
  const marker = `path === '${route}'`;
  const start = workerSource.indexOf(marker);
  assert.notEqual(start, -1, `${route} route must exist`);
  const nextRoute = workerSource.indexOf("\n    if (path === '", start + marker.length);
  return workerSource.slice(start, nextRoute === -1 ? workerSource.length : nextRoute);
}

const encoder = new TextEncoder();
async function hmac(keyBytes, value) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(value));
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function buildInitData(botToken, telegramId) {
  const fields = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `readiness-${telegramId}`,
    user: JSON.stringify({ id: Number(telegramId), first_name: `Player ${telegramId}` }),
  });
  const check = Array.from(fields.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = await hmac(encoder.encode('WebAppData'), botToken);
  fields.set('hash', hex(await hmac(secret, check)));
  return fields.toString();
}

async function postAppRoute(path, db, telegramId, body = {}) {
  const response = await worker.fetch(new Request(`https://moonboys-api.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': `127.0.0.${String(telegramId).slice(-1) || '1'}` },
    body: JSON.stringify({ init_data: await buildInitData(BOT_TOKEN, telegramId), ...body }),
  }), { DB: db, TELEGRAM_BOT_TOKEN: BOT_TOKEN, RATE_LIMIT_PUBLIC_PER_MINUTE: '1000', RATE_LIMIT_TELEGRAM_PER_MINUTE: '1000' });
  return { status: response.status, body: await response.json() };
}

const BOT_TOKEN = '123456:test_bot_token';
const db = new D1();

const missingCapabilityRuntime = new Function(
  'state',
  `${extractTestExport(clientSource, 'capabilityCombatHelper')}; return { combatCapability, hasCombatUnlocked };`,
)({});
assert.equal(missingCapabilityRuntime.hasCombatUnlocked(), false, 'missing capability payload must fail closed');
assert.equal(missingCapabilityRuntime.combatCapability({}).reason, 'capability_unavailable', 'missing capability payload must expose capability_unavailable');

const newState = await buildPetMiniAppState(db, '100001', BOT_TOKEN);
assert.equal(newState.adopted, false, 'new player state must stay unadopted');
assert.equal(newState.capabilities_version, 1, 'new player state must expose capability contract v1');
assert.ok(newState.capabilities?.systems, 'new player state must include systems capabilities');
assert.equal(newState.capabilities.combat.unlocked, false, 'new players cannot enter combat');

seedUser(db, '100002', 'Egg Player');
await setActivePetLifecyclePhase(db, '100002', 'egg');
const eggAction = await act(db, '100002', 'arena_matchmake');
assert.equal(eggAction.accepted, false, 'egg users cannot enter combat');
assert.equal(eggAction.capabilities_version, 1, 'combat action rejections include capability state');
assert.equal(eggAction.capabilities?.combat?.unlocked, false, 'combat rejection returns nested capability authority');

seedUser(db, '100003', 'Hatched Player');
await setActivePetLifecyclePhase(db, '100003', 'adult');
const hatchedEligibility = await getPetMiniAppCombatEligibility(db, '100003');
assert.equal(hatchedEligibility.combat_unlocked, false, 'hatched active pets still need completed Season authority');
assert.equal(hatchedEligibility.reason, 'completed_season_pet_required');

seedUser(db, '100004', 'Completed Egg');
markSeasonComplete(db, '100004');
await setActivePetLifecyclePhase(db, '100004', 'egg');
const completedEggEligibility = await getPetMiniAppCombatEligibility(db, '100004');
assert.equal(completedEggEligibility.has_completed_season_pet, true, 'completed egg keeps completed-season authority');
assert.equal(completedEggEligibility.combat_unlocked, false, 'completed Season pet plus active egg remains locked');
assert.equal(completedEggEligibility.reason, 'moon_egg_must_hatch');
assert.equal((await act(db, '100004', 'kaiju_matchmake')).reason, 'moon_egg_must_hatch',
  'completed Season pet plus active egg rejects combat with moon_egg_must_hatch');

seedUser(db, '100005', 'Completed Adult');
markSeasonComplete(db, '100005');
await setActivePetLifecyclePhase(db, '100005', 'adult');
const completedAdultEligibility = await getPetMiniAppCombatEligibility(db, '100005');
assert.equal(completedAdultEligibility.combat_unlocked, true, 'completed Season pet plus hatched active pet passes combat gate');
assert.equal(buildPetMiniAppCapabilities(completedAdultEligibility).systems.arena.state, 'AVAILABLE');
assert.notEqual((await act(db, '100005', 'arena_matchmake')).reason, 'completed_season_pet_required',
  'completed hatched users are not blocked by the completed-season combat gate');

seedUser(db, '100006', 'Missing Lifecycle');
markSeasonComplete(db, '100006');
await ensurePetStarterSeasonSlot(db, '100006');
const missingLifecyclePet = await ensureActivePetInstance(db, '100006');
db.database.prepare('DELETE FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND telegram_id=?')
  .run(missingLifecyclePet.pet_id, '100006');
assert.match(workerSource, /!activeLifecycle \? 'moonpet_lifecycle_required'/,
  'combat authority must retain an explicit missing-lifecycle fail-closed branch');
const missingLifecycleEligibility = buildPetMiniAppCapabilities({
  has_completed_season_pet: true,
  active_pet_exists: true,
  active_pet_lifecycle_known: false,
  active_pet_combat_eligible: false,
  combat_unlocked: false,
  reason: 'moonpet_lifecycle_required',
}).combat;
assert.equal(missingLifecycleEligibility.requirements.active_pet_lifecycle_known, false, 'missing lifecycle data must be explicit');
assert.equal(missingLifecycleEligibility.unlocked, false, 'missing lifecycle data fails closed');
assert.equal(missingLifecycleEligibility.reason, 'moonpet_lifecycle_required');

const prestigeResult = await act(db, '100005', 'prestige');
assert.equal(prestigeResult.accepted, false, 'Prestige cannot be invoked from crafted Mini App actions');
assert.equal(prestigeResult.reason, 'feature_not_available', 'Prestige always returns feature_not_available');
const weeklyJourney = buildPetMiniAppCapabilities(completedAdultEligibility).weekly_journey;
assert.equal(weeklyJourney.reason, 'feature_not_available', 'Weekly Journey remains planned expansion');
assert.equal(weeklyJourney.active, false, 'Weekly Journey remains inactive');

const lockedCountsBefore = countCombatRows(db, '100004');
for (const action of ['arena_start', 'arena_matchmake', 'kaiju_start', 'kaiju_matchmake', 'kaiju_card']) {
  const result = await act(db, '100004', action, { match_id: 'locked-match' });
  assert.equal(result.accepted, false, `${action} must reject active eggs`);
  assert.equal(result.capabilities_version, 1, `${action} rejection must include capability contract version`);
  assert.equal(result.capabilities?.combat?.reason, 'moon_egg_must_hatch', `${action} rejection must include combat capability state`);
}
assert.deepEqual(countCombatRows(db, '100004'), lockedCountsBefore, 'locked combat actions create no queue, match, or battle writes');

db.database.prepare(`INSERT INTO telegram_pet_arena_queue
  (id, chat_id, telegram_id, rank_bucket, pet_snapshot_json, status)
  VALUES ('readiness-arena-owned', 'mini:arena:global', '100004', 'silver', '{}', 'waiting'),
         ('readiness-arena-other', 'mini:arena:global', '100003', 'silver', '{}', 'waiting')`).run();
assert.equal((await act(db, '100004', 'arena_queue_cancel')).reason, 'arena_queue_cancelled', 'stale Arena queue cleanup works for caller-owned state');
assert.equal(db.database.prepare("SELECT status FROM telegram_pet_arena_queue WHERE id='readiness-arena-other'").get().status, 'waiting',
  'stale Arena queue cleanup must not clear another player queue');

db.database.prepare(`INSERT INTO telegram_pet_kaiju_queue
  (id, chat_id, telegram_id, status)
  VALUES ('readiness-kaiju-owned', 'mini:kaiju:global', '100004', 'waiting'),
         ('readiness-kaiju-other', 'mini:kaiju:global', '100003', 'waiting')`).run();
assert.equal((await act(db, '100004', 'kaiju_queue_cancel')).reason, 'kaiju_queue_cancelled', 'stale Kaiju queue cleanup works for caller-owned state');
assert.equal(db.database.prepare("SELECT status FROM telegram_pet_kaiju_queue WHERE id='readiness-kaiju-other'").get().status, 'waiting',
  'stale Kaiju queue cleanup must not clear another player queue');

db.database.prepare(`INSERT INTO telegram_pet_kaiju_matches
  (id, match_id, chat_id, mode, status, player1_telegram_id)
  VALUES ('readiness-solo-row', 'readiness-solo', 'mini:kaiju:100004', 'solo', 'selecting', '100004')`).run();
assert.equal((await act(db, '100004', 'kaiju_match_cancel', { match_id: 'readiness-solo' })).reason, 'kaiju_match_cancelled',
  'stale solo Kaiju cleanup works for caller-owned stale state');
assert.equal(db.database.prepare("SELECT status FROM telegram_pet_kaiju_matches WHERE match_id='readiness-solo'").get().status, 'cancelled');

db.database.prepare(`INSERT INTO telegram_pet_kaiju_matches
  (id, match_id, chat_id, mode, status, player1_telegram_id, player2_telegram_id)
  VALUES ('readiness-group-row', 'readiness-group', 'mini:kaiju:global', 'group', 'selecting', '100004', '100005')`).run();
for (const telegramId of ['100004', '100005']) {
  const result = await act(db, telegramId, 'kaiju_match_cancel', { match_id: 'readiness-group' });
  assert.equal(result.accepted, false, 'active multiplayer Kaiju cannot be cancelled through stale cleanup');
  assert.equal(result.reason, 'kaiju_match_not_found');
}
assert.equal(db.database.prepare("SELECT status FROM telegram_pet_kaiju_matches WHERE match_id='readiness-group'").get().status, 'selecting',
  'active multiplayer Kaiju remains active after stale cleanup attempts');

const completedAdultState = await buildPetMiniAppState(db, '100005', BOT_TOKEN);
assert.equal(completedAdultState.capabilities_version, 1, 'Mini App state includes capabilities_version: 1');
assert.ok(completedAdultState.capabilities?.systems, 'Mini App state includes capabilities.systems');
for (const duplicateField of ['has_completed_season_pet', 'combat_unlocked', 'combat_eligibility']) {
  assert.equal(Object.prototype.hasOwnProperty.call(completedAdultState, duplicateField), false,
    `Mini App state must not serialize duplicate top-level ${duplicateField}`);
}

const stateRoute = routeBlock('/telegram-pets/app/state');
assert.match(stateRoute, /return json\(\{ ok: true, state \}\)/, '/telegram-pets/app/state must return the canonical Mini App state envelope');
const actionRoute = routeBlock('/telegram-pets/app/action');
assert.match(actionRoute, /serializePetMiniAppActionResult\(result, state\?\.guidance\?\.identity, verified\.telegramId\)/,
  '/telegram-pets/app/action must serialize action rejections through the Mini App result contract');
assert.match(actionRoute, /const state = await buildPetMiniAppState/, '/telegram-pets/app/action must refresh state after mutations/rejections');
const sanctuaryRoute = routeBlock('/telegram-pets/app/sanctuary');
assert.match(sanctuaryRoute, /reason: 'feature_not_available'/, '/telegram-pets/app/sanctuary must stay unavailable');
assert.match(sanctuaryRoute, /capabilities_version: 1/, '/telegram-pets/app/sanctuary must include capability contract version');
assert.match(sanctuaryRoute, /buildPetMiniAppCapabilities\(combatEligibility\)/,
  'Sanctuary unavailable response must not fake completed-season capability state');
assert.doesNotMatch(sanctuaryRoute, /has_completed_season_pet:\s*false/,
  'Sanctuary unavailable response must not overwrite completed-season capability authority');

const routeDb = new D1();
seedUser(routeDb, '200004', 'Route Egg');
markSeasonComplete(routeDb, '200004');
await setActivePetLifecyclePhase(routeDb, '200004', 'egg');
const stateSmoke = await postAppRoute('/telegram-pets/app/state', routeDb, '200004');
assert.equal(stateSmoke.status, 200, '/telegram-pets/app/state smoke route returns 200');
assert.equal(stateSmoke.body.state.capabilities_version, 1, '/telegram-pets/app/state response includes capabilities_version: 1');
assert.ok(stateSmoke.body.state.capabilities?.systems, '/telegram-pets/app/state response includes capabilities.systems');

const sanctuarySmoke = await postAppRoute('/telegram-pets/app/sanctuary', routeDb, '200004');
assert.equal(sanctuarySmoke.status, 200, '/telegram-pets/app/sanctuary unavailable smoke route returns 200');
assert.equal(sanctuarySmoke.body.reason, 'feature_not_available', 'unavailable Sanctuary route returns feature_not_available');
assert.equal(sanctuarySmoke.body.capabilities?.combat?.requirements?.completed_season_pet, true,
  'Sanctuary unavailable response does not fake completed-season capability state');

const actionSmokeBefore = countCombatRows(routeDb, '200004');
const actionSmoke = await postAppRoute('/telegram-pets/app/action', routeDb, '200004', { action: 'kaiju_matchmake', request_id: 'route:locked-kaiju' });
assert.equal(actionSmoke.status, 409, '/telegram-pets/app/action returns conflict for locked combat action');
assert.equal(actionSmoke.body.result.reason, 'moon_egg_must_hatch', 'route-level action rejection returns combat lock reason');
assert.equal(actionSmoke.body.result.capabilities_version, 1, 'route-level action rejection includes capability contract version');
assert.ok(actionSmoke.body.result.capabilities?.combat, 'route-level action rejection includes capability state');
assert.deepEqual(countCombatRows(routeDb, '200004'), actionSmokeBefore, 'locked route-level combat action creates no queue/match/battle writes');

console.log('telegram-pets-season-1-production-readiness.test.mjs passed');

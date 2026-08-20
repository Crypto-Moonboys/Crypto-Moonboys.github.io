import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const playerExpansionMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8');
const {
  processPetMiniAppAction,
  buildPetMiniAppState,
  buildPetMiniAppJourneySummary,
  buildPetMiniAppFutureSystemState,
  buildPetMiniAppCapabilities,
  getPetMiniAppCombatEligibility,
  getPetGuidanceFeatures,
  DAILY_JOURNEY_REQUIRED_OBJECTIVES,
  WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
  ensurePetStarterSeasonSlot,
  ensureActivePetInstance,
  PET_DAILY_CHALLENGES,
  getPetArenaBattleForPlayer,
  getPetArenaQueueState,
  getPetKaijuMatchForPlayer,
  getPetKaijuQueueState,
  serializePetMiniAppArenaBattle,
  serializePetMiniAppKaijuMatch,
  PET_WEEKLY_JOURNEY_OBJECTIVES,
  getPetSeasonInfo,
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
    this.database.exec(playerExpansionMigration);
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

function seedPlayer(db, telegramId, name, xp) {
  db.database.prepare('INSERT INTO telegram_users (telegram_id, first_name, xp, level) VALUES (?, ?, 0, 1)').run(telegramId, name);
  db.database.prepare(`INSERT INTO telegram_pet_profiles
    (telegram_id, pet_name, pet_xp, level, health, energy, happiness, cleanliness, moon_gold)
    VALUES (?, ?, ?, 20, 100, 100, 90, 90, 100)`).run(telegramId, name, xp);
}

function installSeasonCompletionMarkerTable(db) {
  db.database.exec(`CREATE TABLE IF NOT EXISTS telegram_pet_season_completions (
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
    .run(pet.pet_id, telegramId, `test-seed:${telegramId}:${phase}`, phase);
  db.database.prepare('UPDATE telegram_pet_instances SET stage=? WHERE pet_id=? AND telegram_id=?')
    .run(phase, pet.pet_id, telegramId);
  return pet;
}

const db = new D1();
installSeasonCompletionMarkerTable(db);
seedPlayer(db, 'arena-one', 'Alley Cat', 1500);
seedPlayer(db, 'arena-two', 'Cyber Cat', 1520);
seedPlayer(db, 'kaiju-one', 'Kaiju Cat', 1400);
seedPlayer(db, 'kaiju-two', 'Sticker Cat', 1450);
seedPlayer(db, 'arena-queued', 'Queue Cat', 1450);
seedPlayer(db, 'kaiju-queued', 'Queue Kaiju', 1450);
for (const telegramId of ['arena-one', 'arena-two', 'kaiju-one', 'kaiju-two', 'arena-queued', 'kaiju-queued']) {
  markSeasonComplete(db, telegramId);
  await setActivePetLifecyclePhase(db, telegramId, 'adult');
}

const act = (telegramId, action, payload = {}) => processPetMiniAppAction(db, telegramId, { id: telegramId }, {
  action,
  request_id: `${action}:${telegramId}:${crypto.randomUUID()}`,
  ...payload,
}, '123456:test-token');

const lockedCombatDb = new D1();
installSeasonCompletionMarkerTable(lockedCombatDb);
seedPlayer(lockedCombatDb, 'future-locked', 'Locked Cat', 1500);
for (const action of ['arena_start', 'arena_matchmake', 'kaiju_start', 'kaiju_matchmake', 'kaiju_card']) {
  const result = await processPetMiniAppAction(lockedCombatDb, 'future-locked', { id: 'future-locked' }, {
    action,
    match_id: 'locked-kaiju-match',
    request_id: `locked:${action}`,
  }, '123456:test-token');
  assert.equal(result.accepted, false, `${action} must reject early Season 1 users`);
  assert.equal(result.reason, 'completed_season_pet_required', `${action} must explain the completed-pet requirement`);
}
assert.equal(lockedCombatDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_arena_queue WHERE telegram_id='future-locked'").get().count, 0,
  'locked Arena matchmaking must not create queue rows');
assert.equal(lockedCombatDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_kaiju_queue WHERE telegram_id='future-locked'").get().count, 0,
  'locked Kaiju matchmaking must not create queue rows');
lockedCombatDb.database.prepare(`INSERT INTO telegram_pet_arena_queue
  (id, chat_id, telegram_id, rank_bucket, pet_snapshot_json, status)
  VALUES ('locked-arena-queue', 'mini:arena:global', 'future-locked', 'silver', '{}', 'waiting')`).run();
lockedCombatDb.database.prepare(`INSERT INTO telegram_pet_kaiju_queue
  (id, chat_id, telegram_id, status)
  VALUES ('locked-kaiju-queue', 'mini:kaiju:global', 'future-locked', 'waiting')`).run();
lockedCombatDb.database.prepare(`INSERT INTO telegram_pet_kaiju_matches
  (id, match_id, chat_id, mode, status, player1_telegram_id)
  VALUES ('locked-kaiju-match-row', 'locked-kaiju-match', 'mini:kaiju:future-locked', 'solo', 'selecting', 'future-locked')`).run();
const lockedArenaCancel = await processPetMiniAppAction(lockedCombatDb, 'future-locked', { id: 'future-locked' }, {
  action: 'arena_queue_cancel',
  request_id: 'locked:arena_queue_cancel',
}, '123456:test-token');
assert.equal(lockedArenaCancel.reason, 'arena_queue_cancelled', 'early Season 1 users must be able to cancel stale Arena queue state');
const lockedKaijuCancel = await processPetMiniAppAction(lockedCombatDb, 'future-locked', { id: 'future-locked' }, {
  action: 'kaiju_queue_cancel',
  request_id: 'locked:kaiju_queue_cancel',
}, '123456:test-token');
assert.equal(lockedKaijuCancel.reason, 'kaiju_queue_cancelled', 'early Season 1 users must be able to cancel stale Kaiju queue state');
const lockedKaijuMatchCancel = await processPetMiniAppAction(lockedCombatDb, 'future-locked', { id: 'future-locked' }, {
  action: 'kaiju_match_cancel',
  match_id: 'locked-kaiju-match',
  request_id: 'locked:kaiju_match_cancel',
}, '123456:test-token');
assert.equal(lockedKaijuMatchCancel.reason, 'kaiju_match_cancelled', 'early Season 1 users must be able to cancel stale owned Kaiju match state');
assert.equal(lockedCombatDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_arena_queue WHERE telegram_id='future-locked' AND status='waiting'").get().count, 0,
  'locked Arena queue cleanup must clear waiting queue state');
assert.equal(lockedCombatDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_arena_battles WHERE player1_telegram_id='future-locked' OR player2_telegram_id='future-locked'").get().count, 0,
  'locked Arena start must not create battle rows');
assert.equal(lockedCombatDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_kaiju_queue WHERE telegram_id='future-locked' AND status='waiting'").get().count, 0,
  'locked Kaiju queue cleanup must clear waiting queue state');
assert.equal(lockedCombatDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_kaiju_matches WHERE (player1_telegram_id='future-locked' OR player2_telegram_id='future-locked') AND status IN ('open','selecting')").get().count, 0,
  'locked Kaiju cleanup must clear active stale match rows');
const lockedPrestigeBefore = lockedCombatDb.database.prepare("SELECT prestige_count FROM telegram_pet_progression_state WHERE telegram_id='future-locked'").get()?.prestige_count || 0;
const lockedPrestigeResult = await processPetMiniAppAction(lockedCombatDb, 'future-locked', { id: 'future-locked' }, {
  action: 'prestige',
  request_id: 'locked:prestige',
}, '123456:test-token');
assert.equal(lockedPrestigeResult.accepted, false, 'early Season 1 users must not be able to prestige from crafted Mini App requests');
assert.equal(lockedPrestigeResult.reason, 'feature_not_available', 'locked Prestige must remain unavailable during early Season 1');
assert.equal(lockedCombatDb.database.prepare("SELECT prestige_count FROM telegram_pet_progression_state WHERE telegram_id='future-locked'").get()?.prestige_count || 0, lockedPrestigeBefore,
  'locked Prestige must not mutate progression state');
assert.equal(lockedCombatDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_system_events WHERE telegram_id='future-locked' AND system_key='prestige'").get().count, 0,
  'locked Prestige must not reserve system events');

const completedCombatDb = new D1();
installSeasonCompletionMarkerTable(completedCombatDb);
seedPlayer(completedCombatDb, 'future-complete', 'Complete Cat', 1500);
markSeasonComplete(completedCombatDb, 'future-complete');
await setActivePetLifecyclePhase(completedCombatDb, 'future-complete', 'adult');
const completedPrestigeResult = await processPetMiniAppAction(completedCombatDb, 'future-complete', { id: 'future-complete' }, {
  action: 'prestige',
  request_id: 'completed:prestige',
}, '123456:test-token');
assert.equal(completedPrestigeResult.accepted, false, 'completed Season users must still be blocked from unavailable Prestige');
assert.equal(completedPrestigeResult.reason, 'feature_not_available', 'Prestige must use the future-feature lock even after completion eligibility');
assert.equal(completedCombatDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_system_events WHERE telegram_id='future-complete' AND system_key='prestige'").get().count, 0,
  'completed-user locked Prestige must not reserve system events');
const completedSanctuaryEligibility = await getPetMiniAppCombatEligibility(completedCombatDb, 'future-complete');
const completedSanctuaryUnavailable = {
  accepted: false,
  reason: 'feature_not_available',
  capabilities_version: 1,
  capabilities: buildPetMiniAppCapabilities(completedSanctuaryEligibility),
};
assert.equal(completedSanctuaryUnavailable.reason, 'feature_not_available',
  'completed-user Sanctuary response must remain unavailable while Sanctuary is future content');
assert.equal(completedSanctuaryUnavailable.capabilities?.combat?.requirements?.completed_season_pet, true,
  'completed-user Sanctuary unavailable response must not lie about completed-season authority');
assert.equal(completedSanctuaryUnavailable.capabilities?.systems?.sanctuary?.state, 'COMING_SOON',
  'completed-user Sanctuary unavailable response must keep Sanctuary status-only');
assert.notEqual((await processPetMiniAppAction(completedCombatDb, 'future-complete', { id: 'future-complete' }, {
  action: 'arena_matchmake',
  request_id: 'completed:arena_matchmake',
}, '123456:test-token')).reason, 'completed_season_pet_required', 'completed Season pet must pass the Arena future-combat gate');
assert.notEqual((await processPetMiniAppAction(completedCombatDb, 'future-complete', { id: 'future-complete' }, {
  action: 'kaiju_matchmake',
  request_id: 'completed:kaiju_matchmake',
}, '123456:test-token')).reason, 'completed_season_pet_required', 'completed Season pet must pass the Kaiju future-combat gate');

const combatAuthorityDb = new D1();
installSeasonCompletionMarkerTable(combatAuthorityDb);
seedPlayer(combatAuthorityDb, 'combat-egg', 'Egg Cat', 1500);
seedPlayer(combatAuthorityDb, 'combat-adult', 'Adult Cat', 1500);
seedPlayer(combatAuthorityDb, 'combat-new', 'New Cat', 1500);
markSeasonComplete(combatAuthorityDb, 'combat-egg');
markSeasonComplete(combatAuthorityDb, 'combat-adult');
markSeasonComplete(combatAuthorityDb, 'combat-missing-lifecycle');
markSeasonComplete(combatAuthorityDb, 'combat-no-pet');
await setActivePetLifecyclePhase(combatAuthorityDb, 'combat-egg', 'egg');
await setActivePetLifecyclePhase(combatAuthorityDb, 'combat-adult', 'adult');
await setActivePetLifecyclePhase(combatAuthorityDb, 'combat-new', 'adult');
const combatEggEligibility = await getPetMiniAppCombatEligibility(combatAuthorityDb, 'combat-egg');
assert.equal(combatEggEligibility.has_completed_season_pet, true, 'combat authority must expose completed-season state for completed egg users');
assert.equal(combatEggEligibility.combat_unlocked, false, 'completed users with an active egg must not see combat as unlocked');
assert.equal(combatEggEligibility.reason, 'moon_egg_must_hatch');
const combatEggCapabilities = buildPetMiniAppCapabilities(combatEggEligibility);
assert.equal(combatEggCapabilities.capabilities_version, 1, 'capability authority must expose a stable contract version');
for (const key of ['arena', 'kaiju', 'prestige', 'breeding', 'traits', 'sanctuary', 'lineage', 'fusion', 'weekly_journey']) {
  assert.ok(combatEggCapabilities.systems?.[key], `${key} must be present in the central capability systems map`);
  assert.equal(['LOCKED', 'COMING_SOON', 'AVAILABLE'].includes(combatEggCapabilities.systems[key].state), true,
    `${key} must use a valid future-system state`);
}
assert.equal(combatEggCapabilities.combat.unlocked, false, 'player capabilities must mirror locked combat authority for active eggs');
assert.equal(combatEggCapabilities.combat.state, 'LOCKED', 'combat capability state must lock active eggs');
assert.equal(combatEggCapabilities.combat.active, false, 'locked combat capability must be inactive');
assert.equal(combatEggCapabilities.combat.requirements.completed_season_pet, true, 'player capabilities must preserve completed-season authority');
assert.equal(combatEggCapabilities.combat.requirements.active_pet_hatched, false, 'player capabilities must expose active egg requirement state');
assert.equal(combatEggCapabilities.systems.arena.state, 'LOCKED', 'central systems map must lock Arena for active eggs');
assert.equal(combatEggCapabilities.systems.kaiju.state, 'LOCKED', 'central systems map must lock Kaiju for active eggs');
assert.equal(combatEggCapabilities.systems.prestige.state, 'COMING_SOON', 'central systems map must keep Prestige coming soon');
assert.equal(combatEggCapabilities.weekly_journey.state, 'LOCKED', 'Weekly Journey capability must fail closed until authority summary exists');
assert.equal(combatEggCapabilities.weekly_journey.active, false, 'Weekly Journey capability must be inactive while authority is syncing');
assert.equal(combatEggCapabilities.systems.weekly_journey.active, false, 'central systems map must keep Weekly Journey inactive while syncing');
assert.equal(combatEggCapabilities.weekly_journey.message, 'Weekly Journey authority is syncing.',
  'Weekly Journey capability must explain missing authority state');
for (const key of ['breeding', 'sanctuary', 'fusion', 'prestige']) {
  const system = combatEggCapabilities.systems[key];
  assert.equal(system.state, 'COMING_SOON', `${key} must be represented as coming soon when unavailable after completion`);
  assert.equal(system.active, false, `${key} must remain inactive while unavailable`);
  assert.equal(system.unlocked, false, `${key} must remain locked while unavailable`);
  for (const field of ['progress', 'completion', 'completed', 'rewards', 'reward', 'readiness', 'eligible', 'weekly_crest_awarded', 'growth_mark_awarded']) {
    assert.equal(Object.prototype.hasOwnProperty.call(system, field), false,
      `${key} capability must not expose live-looking ${field} data while inactive`);
  }
}
assert.equal(combatEggCapabilities.systems.weekly_journey.state, 'LOCKED',
  'Weekly Journey must not be represented as coming soon once live tracking exists');
assert.equal(combatEggCapabilities.systems.weekly_journey.reason, 'weekly_journey_authority_syncing',
  'Weekly Journey missing authority must fail closed as syncing');
const combatEggAction = await processPetMiniAppAction(combatAuthorityDb, 'combat-egg', { id: 'combat-egg' }, {
  action: 'kaiju_matchmake',
  request_id: 'combat-egg:kaiju_matchmake',
}, '123456:test-token');
assert.equal(combatEggAction.accepted, false, 'completed users with an active egg must not enter Kaiju combat');
assert.equal(combatEggAction.reason, 'moon_egg_must_hatch', 'API combat lock must match the active-egg UI reason');
assert.equal(combatEggAction.capabilities_version, 1, 'stale-client combat rejection must expose the top-level capability contract version');
assert.equal(combatEggAction.capabilities?.combat?.state, 'LOCKED', 'API must return the shared combat capability state for active-egg rejection');
assert.equal(combatEggAction.capabilities?.combat?.unlocked, false, 'stale-client combat rejection must return nested combat capability authority');
const combatAdultEligibility = await getPetMiniAppCombatEligibility(combatAuthorityDb, 'combat-adult');
assert.equal(combatAdultEligibility.has_completed_season_pet, true, 'combat authority must expose completed-season state for completed adult users');
assert.equal(combatAdultEligibility.combat_unlocked, true, 'completed users with an eligible active pet must see combat unlocked');
assert.equal(buildPetMiniAppCapabilities(combatAdultEligibility).combat.unlocked, true,
  'player capabilities must mirror unlocked combat authority for completed adult users');
const combatAdultAction = await processPetMiniAppAction(combatAuthorityDb, 'combat-adult', { id: 'combat-adult' }, {
  action: 'kaiju_matchmake',
  request_id: 'combat-adult:kaiju_matchmake',
}, '123456:test-token');
assert.notEqual(combatAdultAction.reason, 'completed_season_pet_required', 'completed adult users must pass the completed-season combat gate');
assert.notEqual(combatAdultAction.reason, 'moon_egg_must_hatch', 'completed adult users must pass the active-pet combat gate');
const combatAdultCapabilities = buildPetMiniAppCapabilities(combatAdultEligibility);
assert.equal(combatAdultCapabilities.capabilities_version, 1, 'available capability authority must preserve the contract version');
assert.equal(combatAdultCapabilities.combat?.state, 'AVAILABLE', 'capabilities must expose combat through one nested object');
assert.equal(combatAdultCapabilities.combat?.active, true, 'available combat capability must be active');
assert.equal(combatAdultCapabilities.systems?.arena?.state, 'AVAILABLE', 'central systems map must mark Arena available from combat authority');
assert.equal(combatAdultCapabilities.systems?.kaiju?.state, 'AVAILABLE', 'central systems map must mark Kaiju available from combat authority');
assert.equal(combatAdultCapabilities.arena?.state, 'AVAILABLE', 'Arena display state must be serialized through capabilities');
assert.deepEqual(combatAdultCapabilities.arena, combatAdultCapabilities.systems.arena,
  'Arena compatibility capability must mirror the central systems map');
assert.deepEqual(combatAdultCapabilities.kaiju, combatAdultCapabilities.systems.kaiju,
  'Kaiju compatibility capability must mirror the central systems map');
assert.deepEqual(combatAdultCapabilities.prestige, combatAdultCapabilities.systems.prestige,
  'Prestige compatibility capability must mirror the central systems map');
assert.equal(combatAdultCapabilities.prestige?.state, 'COMING_SOON', 'Prestige must remain coming soon in the single capability object');
assert.equal(combatAdultCapabilities.prestige?.active, false, 'Prestige must remain inactive even for combat-available users');
assert.equal(combatAdultCapabilities.weekly_journey?.state, 'LOCKED', 'Weekly Journey must fail closed without an authority summary in the single capability object');
const weeklyLiveCapabilities = buildPetMiniAppCapabilities(combatAdultEligibility, {
  pet_id: 'pet-combat-adult',
  qualification_week: 1,
  completed_objectives: 0,
  required_objectives: WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
  objectives: [],
  weekly_crest_awarded: false,
  duplicate_blocked: false,
  reason: 'weekly_journey_in_progress',
});
assert.equal(weeklyLiveCapabilities.weekly_journey?.state, 'AVAILABLE', 'Weekly Journey capability must be available when authority summary exists');
assert.equal(weeklyLiveCapabilities.weekly_journey?.active, true, 'Weekly Journey capability must be active when authority summary exists');
assert.equal(weeklyLiveCapabilities.weekly_journey?.qualification_week, 1, 'Weekly Journey live capability must expose qualification week');
assert.equal(weeklyLiveCapabilities.weekly_journey?.required_objectives, WEEKLY_JOURNEY_REQUIRED_OBJECTIVES, 'Weekly Journey live capability must expose required objective threshold');
const emptyStateDb = new D1();
const emptyMiniAppState = await buildPetMiniAppState(emptyStateDb, 'empty-state-user', '123456:test-token');
assert.equal(emptyMiniAppState.capabilities_version, 1, 'Mini App state must expose the top-level capability contract version');
assert.equal(emptyMiniAppState.capabilities?.capabilities_version, 1, 'Mini App state keeps the nested capability object version for compatibility');
assert.equal(emptyMiniAppState.capabilities?.combat?.active, false, 'unadopted Mini App state must fail combat closed through worker authority');
assert.equal(Object.prototype.hasOwnProperty.call(emptyMiniAppState, 'combat_unlocked'), false,
  'Mini App state must not serialize duplicate top-level combat availability');
assert.equal(Object.prototype.hasOwnProperty.call(combatAdultCapabilities, 'has_completed_season_pet'), false,
  'capabilities must not serialize duplicate top-level completed-season authority');
assert.equal(Object.prototype.hasOwnProperty.call(combatAdultCapabilities, 'combat_unlocked'), false,
  'capabilities must not serialize duplicate top-level combat authority');
const combatNewEligibility = await getPetMiniAppCombatEligibility(combatAuthorityDb, 'combat-new');
assert.equal(combatNewEligibility.has_completed_season_pet, false, 'combat authority must expose missing completion state for new users');
assert.equal(combatNewEligibility.combat_unlocked, false, 'new users must not see combat as unlocked');
const combatNewAction = await processPetMiniAppAction(combatAuthorityDb, 'combat-new', { id: 'combat-new' }, {
  action: 'kaiju_matchmake',
  request_id: 'combat-new:kaiju_matchmake',
}, '123456:test-token');
assert.equal(combatNewAction.reason, 'completed_season_pet_required', 'API combat lock must match the missing-completion UI reason');
assert.equal(combatNewAction.capabilities?.combat?.state, 'LOCKED', 'API must return the shared combat capability state for missing-completion rejection');
assert.equal(combatNewAction.capabilities?.combat?.requirements?.completed_season_pet, false,
  'stale-client combat rejection must expose unmet completed-season capability');
assert.equal((await getPetMiniAppCombatEligibility(combatAuthorityDb, 'combat-adult')).combat_unlocked, true,
  'shared combat eligibility helper must unlock only completed users with eligible active pets');
seedPlayer(combatAuthorityDb, 'combat-missing-lifecycle', 'Missing Lifecycle Cat', 1500);
const combatMissingLifecycleEligibility = await getPetMiniAppCombatEligibility(combatAuthorityDb, 'combat-missing-lifecycle');
assert.equal(combatMissingLifecycleEligibility.has_completed_season_pet, true, 'combat authority must preserve completed-season state with missing lifecycle data');
assert.equal(combatMissingLifecycleEligibility.active_pet_lifecycle_known, false, 'combat authority must expose missing lifecycle data');
assert.equal(combatMissingLifecycleEligibility.combat_unlocked, false, 'missing lifecycle data must fail closed for combat');
assert.equal(combatMissingLifecycleEligibility.reason, 'moonpet_lifecycle_required');
const combatNoPetEligibility = await getPetMiniAppCombatEligibility(combatAuthorityDb, 'combat-no-pet');
assert.equal(combatNoPetEligibility.has_completed_season_pet, true, 'combat authority must preserve completed-season state without an active pet');
assert.equal(combatNoPetEligibility.active_pet_exists, false, 'combat authority must explicitly track active pet existence');
assert.equal(combatNoPetEligibility.combat_unlocked, false, 'completed users without an active pet must not unlock combat');
assert.equal(combatNoPetEligibility.reason, 'pet_not_adopted');
const lockedGuidanceFeatures = getPetGuidanceFeatures(100, combatEggEligibility);
assert.equal(lockedGuidanceFeatures.find((feature) => feature.key === 'kaiju_cards')?.available, false,
  'guidance must not recommend Kaiju when combat authority is locked');
assert.equal(lockedGuidanceFeatures.find((feature) => feature.key === 'pet_arena')?.available, false,
  'guidance must not recommend Arena when combat authority is locked');
assert.equal(lockedGuidanceFeatures.find((feature) => feature.key === 'prestige')?.available, false,
  'guidance must not recommend Prestige while it is future content');
const unlockedGuidanceFeatures = getPetGuidanceFeatures(100, combatAdultEligibility);
assert.equal(unlockedGuidanceFeatures.find((feature) => feature.key === 'kaiju_cards')?.available, true,
  'guidance may show Kaiju only when shared combat authority is unlocked');
assert.equal(unlockedGuidanceFeatures.find((feature) => feature.key === 'pet_arena')?.available, true,
  'guidance may show Arena only when shared combat authority is unlocked');
assert.equal(unlockedGuidanceFeatures.find((feature) => feature.key === 'prestige')?.available, false,
  'guidance must keep Prestige unavailable even for combat-unlocked users');
const lockedFutureSystems = buildPetMiniAppFutureSystemState(combatNewEligibility);
assert.equal(lockedFutureSystems.find((system) => system.key === 'breeding')?.status, 'LOCKED',
  'future system authority must lock completion-gated expansion systems before completed-season authority');
assert.equal(lockedFutureSystems.find((system) => system.key === 'arena')?.status, 'LOCKED',
  'future system authority must lock Arena before shared combat eligibility');
const comingSoonFutureSystems = buildPetMiniAppFutureSystemState(combatEggEligibility);
assert.equal(comingSoonFutureSystems.find((system) => system.key === 'breeding')?.status, 'COMING_SOON',
  'completed-season users must see unavailable expansion systems as coming soon');
assert.equal(comingSoonFutureSystems.find((system) => system.key === 'arena')?.status, 'LOCKED',
  'completed-season users with an active egg must still see Arena locked');
const availableFutureSystems = buildPetMiniAppFutureSystemState(combatAdultEligibility);
assert.equal(availableFutureSystems.find((system) => system.key === 'arena')?.status, 'AVAILABLE',
  'Arena future-system authority must reflect shared combat unlock');
assert.equal(availableFutureSystems.find((system) => system.key === 'kaiju')?.status, 'AVAILABLE',
  'Kaiju future-system authority must reflect shared combat unlock');
assert.equal(availableFutureSystems.find((system) => system.key === 'prestige')?.status, 'COMING_SOON',
  'Prestige must remain coming soon even when combat is available');

const transitionDb = new D1();
installSeasonCompletionMarkerTable(transitionDb);
seedPlayer(transitionDb, 'combat-transition', 'Transition Cat', 1500);
await setActivePetLifecyclePhase(transitionDb, 'combat-transition', 'adult');
const transitionBeforeEligibility = await getPetMiniAppCombatEligibility(transitionDb, 'combat-transition');
const transitionBeforeCapabilities = buildPetMiniAppCapabilities(transitionBeforeEligibility);
assert.equal(transitionBeforeCapabilities.systems.arena.state, 'LOCKED', 'Arena must lock before completed-season authority exists');
assert.equal(transitionBeforeCapabilities.systems.kaiju.state, 'LOCKED', 'Kaiju must lock before completed-season authority exists');
assert.equal(getPetGuidanceFeatures(100, transitionBeforeEligibility).find((feature) => feature.key === 'pet_arena')?.available, false,
  'guidance must not recommend Arena before the shared capability unlocks');
const transitionBeforeAction = await processPetMiniAppAction(transitionDb, 'combat-transition', { id: 'combat-transition' }, {
  action: 'arena_matchmake',
  request_id: 'transition:before:arena_matchmake',
}, '123456:test-token');
assert.equal(transitionBeforeAction.accepted, false, 'API must reject combat before completed-season authority exists');
assert.equal(transitionBeforeAction.reason, 'completed_season_pet_required');
markSeasonComplete(transitionDb, 'combat-transition');
const transitionAfterEligibility = await getPetMiniAppCombatEligibility(transitionDb, 'combat-transition');
const transitionAfterCapabilities = buildPetMiniAppCapabilities(transitionAfterEligibility);
assert.equal(transitionAfterCapabilities.systems.arena.state, 'AVAILABLE', 'Arena capability must update after completed-season authority exists');
assert.equal(transitionAfterCapabilities.systems.kaiju.state, 'AVAILABLE', 'Kaiju capability must update after completed-season authority exists');
assert.equal(getPetGuidanceFeatures(100, transitionAfterEligibility).find((feature) => feature.key === 'pet_arena')?.available, true,
  'guidance may recommend Arena only after the shared capability unlocks');
const transitionAfterAction = await processPetMiniAppAction(transitionDb, 'combat-transition', { id: 'combat-transition' }, {
  action: 'arena_matchmake',
  request_id: 'transition:after:arena_matchmake',
}, '123456:test-token');
assert.notEqual(transitionAfterAction.reason, 'completed_season_pet_required',
  'API must follow the same completed-season capability transition as the UI and guidance surfaces');

const priorSeasonCombatDb = new D1();
installSeasonCompletionMarkerTable(priorSeasonCombatDb);
seedPlayer(priorSeasonCombatDb, 'prior-complete', 'Prior Cat', 1500);
markSeasonComplete(priorSeasonCombatDb, 'prior-complete', 'pet-s2025-013');
await setActivePetLifecyclePhase(priorSeasonCombatDb, 'prior-complete', 'adult');
for (const action of ['arena_start', 'arena_matchmake', 'kaiju_start', 'kaiju_matchmake']) {
  const result = await processPetMiniAppAction(priorSeasonCombatDb, 'prior-complete', { id: 'prior-complete' }, {
    action,
    request_id: `prior:${action}:${crypto.randomUUID()}`,
  }, '123456:test-token');
  assert.notEqual(result.reason, 'completed_season_pet_required', `${action} must accept a prior-season completed pet for the completed-season gate`);
}

const journeySummaryDb = new D1();
seedPlayer(journeySummaryDb, 'journey-summary', 'Journey Cat', 1200);
const journeyDay = '2026-08-15';
const journeyWeek = 4;
await ensurePetStarterSeasonSlot(journeySummaryDb, 'journey-summary', new Date(`${journeyDay}T12:00:00Z`));
const journeyPet = await ensureActivePetInstance(journeySummaryDb, 'journey-summary');
const journeySeasonKey = journeyPet.season_key;
const journeyPetId = journeyPet.pet_id;
for (const [challengeId, challenge] of Object.entries(PET_DAILY_CHALLENGES)) {
  journeySummaryDb.database.prepare(`INSERT INTO telegram_pet_daily_journey_objectives
    (event_id, telegram_id, pet_id, season_key, utc_day, challenge_id, event_key, progress_value, status, evidence)
    VALUES (?, 'journey-summary', ?, ?, ?, ?, ?, ?, 'accepted', '{}')`)
    .run(`daily-summary:${challengeId}`, journeyPetId, journeySeasonKey, journeyDay, challengeId, `daily-evidence:${challengeId}`, Math.max(0, Number(challenge.target || 1) - 1));
}
for (const [objectiveId, objective] of Object.entries(PET_WEEKLY_JOURNEY_OBJECTIVES)) {
  journeySummaryDb.database.prepare(`INSERT INTO telegram_pet_weekly_journey_objectives
    (event_id, telegram_id, pet_id, season_key, qualification_week, objective_id, source_event_key, source_event_type, progress_value, status, evidence)
    VALUES (?, 'journey-summary', ?, ?, ?, ?, ?, 'weekly_journey_test', ?, 'accepted', '{}')`)
    .run(`weekly-summary:${objectiveId}`, journeyPetId, journeySeasonKey, journeyWeek, objectiveId, `weekly-evidence:${objectiveId}`, Math.max(0, Number(objective.target || 1) - 1));
}
const journeySummary = await buildPetMiniAppJourneySummary(journeySummaryDb, 'journey-summary', {
  season: { key: journeySeasonKey },
  current_season_week: journeyWeek,
  slots: [{ active: true, pet_id: journeyPetId, season_key: journeySeasonKey }],
}, new Date(`${journeyDay}T12:00:00Z`));
assert.equal(journeySummary.daily.required_objectives, DAILY_JOURNEY_REQUIRED_OBJECTIVES,
  'Daily Journey Mini App summary must reflect the exported authority threshold');
assert.equal(journeySummary.weekly.required_objectives, WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
  'Weekly Journey Mini App summary must reflect the exported authority threshold');
assert.equal(
  journeySummaryDb.database.prepare("SELECT COUNT(DISTINCT challenge_id) AS count FROM telegram_pet_daily_journey_objectives WHERE telegram_id='journey-summary' AND status='accepted'").get().count,
  Object.keys(PET_DAILY_CHALLENGES).length,
  'Daily Journey summary fixture must include accepted evidence for every objective ID',
);
assert.equal(journeySummary.daily.completed_objectives, 0, 'Daily Journey Mini App summary must not count below-target evidence as completed objectives');
assert.equal(journeySummary.daily.completed_objectives < journeySummary.daily.required_objectives, true);
assert.equal(journeySummary.daily.growth_mark_awarded, false);
assert.notEqual(journeySummary.daily.reason, 'daily_journey_ready');
assert.equal(
  journeySummaryDb.database.prepare("SELECT COUNT(DISTINCT objective_id) AS count FROM telegram_pet_weekly_journey_objectives WHERE telegram_id='journey-summary' AND status='accepted'").get().count,
  Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES).length,
  'Weekly Journey summary fixture must include accepted evidence for every objective ID',
);
assert.equal(journeySummary.weekly.completed_objectives, 0, 'Weekly Journey Mini App summary must not count below-target evidence as completed objectives');
assert.equal(journeySummary.weekly.completed_objectives < journeySummary.weekly.required_objectives, true);
assert.equal(journeySummary.weekly.weekly_crest_awarded, false);
assert.notEqual(journeySummary.weekly.reason, 'weekly_journey_ready');

const zeroWeeklyDb = new D1();
seedPlayer(zeroWeeklyDb, 'weekly-zero-progress', 'Zero Weekly Cat', 1200);
await ensurePetStarterSeasonSlot(zeroWeeklyDb, 'weekly-zero-progress', new Date());
const zeroWeeklyState = await buildPetMiniAppState(zeroWeeklyDb, 'weekly-zero-progress', '123456:test-token');
assert.equal(zeroWeeklyState.weekly_journey.state, 'AVAILABLE',
  'active pet with zero weekly evidence must show live Weekly Journey as AVAILABLE');
assert.equal(zeroWeeklyState.weekly_journey.active, true,
  'active pet with zero weekly evidence must keep Weekly Journey active');
assert.equal(zeroWeeklyState.weekly_journey.completed_objectives, 0,
  'active pet with zero weekly evidence must expose zero completed objectives');
assert.equal(zeroWeeklyState.weekly_journey.required_objectives, WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
  'zero-progress Weekly Journey must expose the required objective threshold');
assert.equal(zeroWeeklyState.weekly_journey.objectives.length, Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES).length,
  'zero-progress Weekly Journey must expose all configured objectives');
assert.equal(zeroWeeklyState.capabilities.weekly_journey.state, 'AVAILABLE',
  'zero-progress Weekly Journey capability must be AVAILABLE');
assert.equal(zeroWeeklyState.capabilities.weekly_journey.active, true,
  'zero-progress Weekly Journey capability must be active');

const unavailableWeeklyDb = new D1();
seedPlayer(unavailableWeeklyDb, 'weekly-authority-unavailable', 'Syncing Weekly Cat', 1200);
await ensurePetStarterSeasonSlot(unavailableWeeklyDb, 'weekly-authority-unavailable', new Date());
unavailableWeeklyDb.database.exec('DROP TABLE telegram_pet_weekly_journey_objectives');
const unavailableWeeklyState = await buildPetMiniAppState(unavailableWeeklyDb, 'weekly-authority-unavailable', '123456:test-token');
assert.equal(unavailableWeeklyState.weekly_journey.state, 'LOCKED',
  'weekly objective read failure must fail closed instead of fabricating zero progress');
assert.equal(unavailableWeeklyState.weekly_journey.active, false,
  'weekly objective read failure must keep Weekly Journey inactive');
assert.equal(unavailableWeeklyState.weekly_journey.reason, 'weekly_journey_authority_syncing',
  'weekly objective read failure must surface authority syncing');
assert.equal(unavailableWeeklyState.capabilities.weekly_journey.state, 'LOCKED',
  'weekly objective read failure must keep capability locked');

const receiptAuthorityDb = new D1();
seedPlayer(receiptAuthorityDb, 'receipt-authority', 'Receipt Cat', 1200);
const receiptDay = '2026-08-16';
const receiptWeek = 5;
await ensurePetStarterSeasonSlot(receiptAuthorityDb, 'receipt-authority', new Date(`${receiptDay}T12:00:00Z`));
const receiptPet = await ensureActivePetInstance(receiptAuthorityDb, 'receipt-authority');
receiptAuthorityDb.database.prepare(`INSERT INTO telegram_pet_daily_journey_receipts
  (receipt_id, event_key, telegram_id, pet_id, season_key, utc_day, completed_objectives, status, reason, growth_mark_id, created_at)
  VALUES ('daily-accepted', 'daily:accepted', 'receipt-authority', ?, ?, ?, 3, 'accepted', 'daily_journey_qualified', 'growth:accepted', '2026-08-16T09:00:00.000Z')`)
  .run(receiptPet.pet_id, receiptPet.season_key, receiptDay);
receiptAuthorityDb.database.prepare(`INSERT INTO telegram_pet_daily_journey_receipts
  (receipt_id, event_key, telegram_id, pet_id, season_key, utc_day, completed_objectives, status, reason, growth_mark_id, created_at)
  VALUES ('daily-duplicate', 'daily:duplicate', 'receipt-authority', ?, ?, ?, 3, 'rejected', 'daily_journey_growth_mark_duplicate', 'growth:accepted', '2026-08-16T10:00:00.000Z')`)
  .run(receiptPet.pet_id, receiptPet.season_key, receiptDay);
receiptAuthorityDb.database.prepare(`INSERT INTO telegram_pet_weekly_journey_receipts
  (receipt_id, event_key, telegram_id, pet_id, season_key, qualification_week, completed_objectives, status, reason, crest_id, created_at)
  VALUES ('weekly-accepted', 'weekly:accepted', 'receipt-authority', ?, ?, ?, 5, 'accepted', 'weekly_journey_qualified', 'crest:accepted', '2026-08-16T09:00:00.000Z')`)
  .run(receiptPet.pet_id, receiptPet.season_key, receiptWeek);
receiptAuthorityDb.database.prepare(`INSERT INTO telegram_pet_weekly_journey_receipts
  (receipt_id, event_key, telegram_id, pet_id, season_key, qualification_week, completed_objectives, status, reason, crest_id, created_at)
  VALUES ('weekly-duplicate', 'weekly:duplicate', 'receipt-authority', ?, ?, ?, 5, 'rejected', 'weekly_journey_crest_duplicate', 'crest:accepted', '2026-08-16T10:00:00.000Z')`)
  .run(receiptPet.pet_id, receiptPet.season_key, receiptWeek);
const receiptAuthoritySummary = await buildPetMiniAppJourneySummary(receiptAuthorityDb, 'receipt-authority', {
  season: { key: receiptPet.season_key },
  current_season_week: receiptWeek,
  slots: [{ active: true, pet_id: receiptPet.pet_id, season_key: receiptPet.season_key }],
}, new Date(`${receiptDay}T12:00:00Z`));
assert.equal(receiptAuthoritySummary.daily.growth_mark_awarded, true, 'Daily Journey summary must keep Growth Mark awarded when a later duplicate receipt exists');
assert.equal(receiptAuthoritySummary.daily.duplicate_blocked, true, 'Daily Journey summary must still surface duplicate-blocked state separately');
assert.equal(receiptAuthoritySummary.daily.reason, 'daily_journey_growth_mark_duplicate');
assert.equal(receiptAuthoritySummary.weekly.weekly_crest_awarded, true, 'Weekly Journey summary must keep Crest awarded when a later duplicate receipt exists');
assert.equal(receiptAuthoritySummary.weekly.duplicate_blocked, true, 'Weekly Journey summary must still surface duplicate-blocked state separately');
assert.equal(receiptAuthoritySummary.weekly.reason, 'weekly_journey_crest_duplicate');

const soloArenaQueue = await act('arena-queued', 'arena_matchmake');
assert.equal(soloArenaQueue.reason, 'arena_queued');
assert.equal((await act('arena-queued', 'arena_start')).reason, 'arena_queue_active', 'queued Arena player must not start a solo battle');
await act('arena-queued', 'arena_queue_cancel');

const arenaQueued = await act('arena-one', 'arena_matchmake');
assert.equal(arenaQueued.reason, 'arena_queued');
assert.equal((await getPetArenaQueueState(db, 'mini:arena:global', 'arena-one')).waiting, true);

const arenaMatched = await act('arena-two', 'arena_matchmake');
assert.equal(arenaMatched.reason, 'arena_match_found');
const arenaBattle = await getPetArenaBattleForPlayer(db, 'mini:arena:global', 'arena-one');
assert.ok(arenaBattle?.battle_id);
assert.equal(await getPetArenaQueueState(db, 'mini:arena:global', 'arena-one'), null);
assert.equal(serializePetMiniAppArenaBattle(arenaBattle, 'arena-two').player.pet_name, 'Cyber Cat', 'arena state must orient each player as self');
assert.equal(serializePetMiniAppArenaBattle(arenaBattle, 'arena-two').player.telegram_id, undefined, 'Arena DTO must redact the player Telegram ID');
assert.equal(serializePetMiniAppArenaBattle(arenaBattle, 'arena-two').opponent.telegram_id, undefined, 'Arena DTO must redact the opponent Telegram ID');

const firstReady = await act('arena-one', 'arena_ready', { battle_id: arenaBattle.battle_id });
assert.equal(firstReady.reason, 'waiting_for_opponent');
assert.equal(firstReady.battle.status, 'readying', 'one Ready must not activate a PvP battle');
const secondReady = await act('arena-two', 'arena_ready', { battle_id: arenaBattle.battle_id });
assert.equal(secondReady.battle.status, 'active');
const firstMove = await act('arena-one', 'arena_move', { battle_id: arenaBattle.battle_id, expected_round: 1, move: 'ab' });
assert.equal(firstMove.reason, 'waiting_for_opponent');
const secondMove = await act('arena-two', 'arena_move', { battle_id: arenaBattle.battle_id, expected_round: 1, move: 'bh' });
assert.ok(['round_resolved', 'arena_completed'].includes(secondMove.reason));

const soloKaijuQueue = await act('kaiju-queued', 'kaiju_matchmake');
assert.equal(soloKaijuQueue.reason, 'kaiju_queued');
assert.equal((await act('kaiju-queued', 'kaiju_start')).reason, 'kaiju_queue_active', 'queued Kaiju player must not start a solo match');
await act('kaiju-queued', 'kaiju_queue_cancel');
const kaijuQueued = await act('kaiju-one', 'kaiju_matchmake');
assert.equal(kaijuQueued.reason, 'kaiju_queued');
assert.equal((await getPetKaijuQueueState(db, 'kaiju-one')).waiting, true);
const kaijuMatched = await act('kaiju-two', 'kaiju_matchmake');
assert.equal(kaijuMatched.reason, 'kaiju_match_found');
const kaijuMatch = await getPetKaijuMatchForPlayer(db, 'kaiju-one');
assert.equal(kaijuMatch.mode, 'group');
assert.equal(serializePetMiniAppKaijuMatch(kaijuMatch, 'kaiju-two').role, 'player2');
const participantCancel = await act('kaiju-two', 'kaiju_match_cancel', { match_id: kaijuMatch.match_id });
assert.equal(participantCancel.accepted, false, 'active multiplayer Kaiju participants must not use stale-match cancellation');
assert.equal(participantCancel.reason, 'kaiju_match_not_found');
const hostCancel = await act('kaiju-one', 'kaiju_match_cancel', { match_id: kaijuMatch.match_id });
assert.equal(hostCancel.accepted, false, 'active multiplayer Kaiju hosts must not use stale-match cancellation');
assert.equal(hostCancel.reason, 'kaiju_match_not_found');
assert.equal((await getPetKaijuMatchForPlayer(db, 'kaiju-one'))?.status, 'selecting',
  'active multiplayer Kaiju match must remain active after participant cancel attempt');

const firstCard = await act('kaiju-one', 'kaiju_card', { match_id: kaijuMatch.match_id, card_key: 'big-daddy-kong' });
assert.equal(firstCard.reason, 'kaiju_card_waiting');
const hiddenKaiju = serializePetMiniAppKaijuMatch(firstCard.match, 'kaiju-two');
assert.equal(hiddenKaiju.opponent_card_key, null, 'active Kaiju DTO must conceal the opponent card');
assert.equal(hiddenKaiju.category_key, kaijuMatch.category_key, 'active Kaiju DTO must reveal the persisted scoring category before card lock');
assert.ok(Number(hiddenKaiju.roll) >= 1 && Number(hiddenKaiju.roll) <= 6, 'active Kaiju DTO must reveal the persisted category roll');
assert.equal(hiddenKaiju.score, null, 'active Kaiju DTO must conceal unresolved scores');
assert.equal(hiddenKaiju.player1_telegram_id, undefined, 'Kaiju DTO must redact player identifiers');
const secondCard = await act('kaiju-two', 'kaiju_card', { match_id: kaijuMatch.match_id, card_key: 'god-dzilla' });
assert.equal(secondCard.reason, 'kaiju_completed');
assert.ok(['player1_win', 'player2_win', 'draw'].includes(secondCard.match.result));
assert.equal(await getPetKaijuMatchForPlayer(db, 'kaiju-one'), null);

const workerSource = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
assert.match(workerSource, /LEFT JOIN telegram_pet_lifecycle_by_pet l ON l\.telegram_id = p\.telegram_id/, 'Mini App leaderboard must join persisted lifecycle identity');
assert.match(workerSource, /serializePetLeaderboardEntry\(entry, index\)/, 'Mini App leaderboard must use the canonical privacy-safe serializer');
assert.match(clientSource, /if \(lifecycle\.phase === 'egg'\) \{/, 'renderer must route actual eggs separately from formal evolution stage');
assert.match(clientSource, /drawMoonEgg\(time, active, lifecycle\.incubation\)/, 'only the egg lifecycle branch may render the dedicated Moon Egg with real incubation progress');
for (const field of ['species_name', 'rare_morph_name', 'moon_gold', 'moon_crystals', 'style_tokens']) {
  assert.ok(clientSource.includes(`entry.${field}`), `Mini App leaderboard must render ${field}`);
}

const legacyCommands = [
  'pet', 'petcoach', 'petprogress', 'petachievements', 'petseason', 'petboss', 'petevolve', 'petgear',
  'adopt', 'feed', 'play', 'clean', 'sleep', 'train', 'petstart', 'petclaim', 'petcancel', 'petactivity',
  'pettrade', 'petname', 'petmissions', 'petshop', 'peteconomy', 'petbounties', 'petexpedition',
  'petmarket', 'petbag', 'petbuy', 'petuse', 'petwork', 'petdaily', 'petevent', 'petarena', 'petkaiju', 'kaiju',
  'petrun', 'petextract', 'petadventure', 'petnotify', 'petleaderboard', 'petscore',
];
for (const command of legacyCommands) {
  assert.match(workerSource, new RegExp(`case '${command}'`), `legacy /${command} route must remain represented`);
}

const appActions = [
  'adopt', 'feed', 'play', 'clean', 'sleep', 'train', 'activity_start', 'activity_claim', 'activity_cancel',
  'trade', 'rename', 'buy', 'use_item', 'work', 'daily_chest', 'random_event', 'adventure', 'run_start',
  'run_step', 'run_extract', 'notification_set', 'bounty_claim', 'expedition', 'market_buy', 'weekly_boss',
  'season_claim', 'evolve', 'arena_start', 'arena_matchmake', 'arena_ready', 'arena_move', 'arena_forfeit',
  'arena_queue_cancel', 'kaiju_start', 'kaiju_matchmake', 'kaiju_card', 'kaiju_queue_cancel', 'kaiju_match_cancel',
];
for (const action of appActions) {
  assert.ok(clientSource.includes(`'${action}'`), `Mini App must expose ${action}`);
  if (['feed', 'play', 'clean', 'sleep', 'train'].includes(action)) continue;
  assert.match(workerSource, new RegExp(`action === '${action}'`), `Worker must handle Mini App action ${action}`);
}
assert.match(workerSource, /\['feed', 'play', 'clean', 'sleep', 'train'\]\.includes\(action\)/, 'Worker must handle all five care actions');

const informationSurfaces = [
  'RECOMMENDED NEXT MOVE', 'VITAL SYSTEMS', 'COMPANION DETAILS', 'DAILY MISSION BUFFER',
  'ACHIEVEMENT ARCHIVE', 'MEMORY ARCHIVE', 'LEARNED APTITUDES', 'EVOLUTION', 'CURRENT PERK',
  'UNLOCK DIRECTORY', 'SPECIALIST TRACKS', 'SEASON //', 'TOP MOONPETS', 'WEEKLY BOSS', 'MOON RUN',
  'PET ADVENTURE', 'STREET EVENT', 'PET ARENA', 'KAIJU CODE CARDS', 'TIMED ACTIVITY', 'JOB TERMINAL',
  'DAILY BOUNTIES', 'CRYSTAL EXPEDITION', 'MOON MARKET', 'PERMANENT SHOP', 'INVENTORY',
  'MOON GOLD TRADE', 'EQUIPMENT PROGRESSION', 'CRAFTING MATERIALS', 'RELIC VAULT',
];
for (const surface of informationSurfaces) {
  assert.ok(clientSource.includes(surface), `Mini App must render ${surface}`);
}

assert.match(clientSource, /valueText\(bounty\.reward\)/, 'bounties must disclose their complete reward');
assert.match(clientSource, /valueText\(offer\.reward\)/, 'market offers must disclose what they grant');
assert.match(clientSource, /item\.description/, 'shop entries must explain what they buy');
assert.match(clientSource, /POSSIBLE FINDS/, 'expeditions must disclose their possible reward pool');
assert.match(clientSource, /boss\.remaining_hp/, 'weekly boss must expose live remaining HP');
assert.match(clientSource, /boss\.weakness/, 'weekly boss must expose its weakness');
assert.match(clientSource, /valueText\(tier\.reward\)/, 'season tiers must disclose their reward');
assert.match(clientSource, /notice_keys: visible\.map/, 'only milestone notices actually shown may be acknowledged');
assert.match(clientSource, /activeScreen === 'work' && activityActive/, 'timed activities must refresh while the Work screen is open');

console.log('telegram-pets-mini-app-parity.test.mjs passed');

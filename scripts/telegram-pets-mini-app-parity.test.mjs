import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { __petMediaTestHooks } from '../workers/moonboys-api/worker.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const {
  processPetMiniAppAction,
  buildPetMiniAppJourneySummary,
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
  constructor() { this.database = new DatabaseSync(':memory:'); this.database.exec(schema); }
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
}

const act = (telegramId, action, payload = {}) => processPetMiniAppAction(db, telegramId, { id: telegramId }, {
  action,
  request_id: `${action}:${telegramId}:${crypto.randomUUID()}`,
  ...payload,
}, '123456:test-token');

const lockedCombatDb = new D1();
installSeasonCompletionMarkerTable(lockedCombatDb);
seedPlayer(lockedCombatDb, 'future-locked', 'Locked Cat', 1500);
for (const action of ['arena_start', 'arena_matchmake', 'kaiju_start', 'kaiju_matchmake']) {
  const result = await processPetMiniAppAction(lockedCombatDb, 'future-locked', { id: 'future-locked' }, {
    action,
    request_id: `locked:${action}`,
  }, '123456:test-token');
  assert.equal(result.accepted, false, `${action} must reject early Season 1 users`);
  assert.equal(result.reason, 'completed_season_pet_required', `${action} must explain the completed-pet requirement`);
}
assert.equal(lockedCombatDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_arena_queue WHERE telegram_id='future-locked'").get().count, 0,
  'locked Arena matchmaking must not create queue rows');
assert.equal(lockedCombatDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_arena_battles WHERE player1_telegram_id='future-locked' OR player2_telegram_id='future-locked'").get().count, 0,
  'locked Arena start must not create battle rows');
assert.equal(lockedCombatDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_kaiju_queue WHERE telegram_id='future-locked'").get().count, 0,
  'locked Kaiju matchmaking must not create queue rows');
assert.equal(lockedCombatDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_kaiju_matches WHERE player1_telegram_id='future-locked' OR player2_telegram_id='future-locked'").get().count, 0,
  'locked Kaiju start must not create match rows');

const completedCombatDb = new D1();
installSeasonCompletionMarkerTable(completedCombatDb);
seedPlayer(completedCombatDb, 'future-complete', 'Complete Cat', 1500);
markSeasonComplete(completedCombatDb, 'future-complete');
assert.notEqual((await processPetMiniAppAction(completedCombatDb, 'future-complete', { id: 'future-complete' }, {
  action: 'arena_matchmake',
  request_id: 'completed:arena_matchmake',
}, '123456:test-token')).reason, 'completed_season_pet_required', 'completed Season pet must pass the Arena future-combat gate');
assert.notEqual((await processPetMiniAppAction(completedCombatDb, 'future-complete', { id: 'future-complete' }, {
  action: 'kaiju_matchmake',
  request_id: 'completed:kaiju_matchmake',
}, '123456:test-token')).reason, 'completed_season_pet_required', 'completed Season pet must pass the Kaiju future-combat gate');

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
  'arena_queue_cancel', 'kaiju_start', 'kaiju_matchmake', 'kaiju_card', 'kaiju_queue_cancel',
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

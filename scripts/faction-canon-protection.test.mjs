import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const LIVE_FACTIONS = Object.freeze([
  'hard-fork-rockers',
  'rugpull-minors',
  'graffpunks',
  'blockchain-furies',
  'crypto-moongirls',
  'blockstars',
  'all-city-bulls',
  'nomad-bears',
  'crypto-stoned-boys',
]);

const ALIGNMENT_FILE = path.join(ROOT, 'js', 'faction-alignment.js');
const EFFECTS_FILE = path.join(ROOT, 'js', 'arcade', 'systems', 'faction-effect-system.js');
const MISSIONS_FILE = path.join(ROOT, 'js', 'arcade', 'systems', 'faction-missions.js');
const WAR_FILE = path.join(ROOT, 'js', 'arcade', 'systems', 'faction-war-system.js');
const LEADERBOARD_FILE = path.join(ROOT, 'js', 'leaderboard-client.js');
const LEADERBOARD_WORKER_FILE = path.join(ROOT, 'workers', 'leaderboard-worker.js');
const GAMES_FILE = path.join(ROOT, 'games', 'index.html');
const COMMUNITY_FILE = path.join(ROOT, 'community.html');
const DOCS_FILE = path.join(ROOT, 'docs', 'ARCADE_GAME_IMPACT_STANDARD.md');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertFileContainsEveryKey(filePath, keys) {
  const src = read(filePath);
  for (const key of keys) {
    assert.ok(src.includes(key), `${path.relative(ROOT, filePath)} is missing faction key: ${key}`);
  }
}

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function checkNoOldLiveLabels() {
  const checks = [
    [ALIGNMENT_FILE, ['Join Diamond Hands', 'Join HODL Warriors', "label: 'Diamond Hands'", "label: 'HODL Warriors'"]],
    [EFFECTS_FILE, ["label:           'Diamond Hands'", "label:           'HODL Warriors'"]],
    [MISSIONS_FILE, ['Diamond Hands', 'HODL Warriors', "'diamond-hands': Object.freeze([", "'hodl-warriors': Object.freeze(["]],
    [GAMES_FILE, ['Diamond Hands', 'HODL Warriors']],
    [COMMUNITY_FILE, ['Diamond Hands', 'HODL Warriors']],
    [DOCS_FILE, ['#### Diamond Hands', '#### HODL Warriors', '| Game | Diamond Hands | HODL Warriors |']],
  ];

  for (const [filePath, forbidden] of checks) {
    const src = read(filePath);
    for (const phrase of forbidden) {
      assert.ok(!src.includes(phrase), `${path.relative(ROOT, filePath)} still contains old live faction wording: ${phrase}`);
    }
  }
}

function checkAlignmentAliases() {
  const src = read(ALIGNMENT_FILE);
  const localStorage = createMemoryStorage();
  const windowObj = {
    MOONBOYS_API: {},
    MOONBOYS_EVENT_BUS: { emit() {} },
    MOONBOYS_IDENTITY: {
      getTelegramAuth() { return null; },
      isTelegramLinked() { return false; },
    },
    dispatchEvent() {},
  };

  const context = vm.createContext({
    window: windowObj,
    localStorage,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    CustomEvent: function CustomEvent(name, init) { this.type = name; this.detail = init && init.detail; },
    console,
    Date,
    Math,
    JSON,
    Object,
    String,
    Number,
    Boolean,
    Array,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(src, context, { filename: 'faction-alignment.js' });
  const api = context.window && context.window.MOONBOYS_FACTION;
  assert.ok(api && typeof api.normalizeFaction === 'function', 'MOONBOYS_FACTION.normalizeFaction must exist');
  assert.equal(api.normalizeFaction('diamond-hands'), 'hard-fork-rockers');
  assert.equal(api.normalizeFaction('diamond_hands'), 'hard-fork-rockers');
  assert.equal(api.normalizeFaction('diamondhands'), 'hard-fork-rockers');
  assert.equal(api.normalizeFaction('hodl-warriors'), 'rugpull-minors');
  assert.equal(api.normalizeFaction('hodl_warriors'), 'rugpull-minors');
  assert.equal(api.normalizeFaction('hodlwarriors'), 'rugpull-minors');
}

async function checkFactionModelsRuntime() {
  globalThis.localStorage = createMemoryStorage();

  const effectModule = await import(pathToFileURL(EFFECTS_FILE).href + `?v=${Date.now()}`);
  const warModule = await import(pathToFileURL(WAR_FILE).href + `?v=${Date.now()}`);

  for (const key of LIVE_FACTIONS) {
    const fx = effectModule.getFactionEffects(key);
    assert.ok(fx && fx.key === key, `Missing faction effect definition for ${key}`);
  }

  const missionSrc = read(MISSIONS_FILE);
  const dailySection = missionSrc.split('var SEASONAL_MISSIONS')[0] || missionSrc;
  const seasonalSection = missionSrc.split('var SEASONAL_MISSIONS')[1] || '';
  for (const key of LIVE_FACTIONS) {
    const keyToken = key.includes('-') ? `['"]${key}['"]` : `(?:['"]${key}['"]|${key})`;
    const dailyMatch = dailySection.match(new RegExp(`${keyToken}\\s*:\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)\\s*,`));
    assert.ok(dailyMatch, `Missing daily mission block for ${key}`);
    const dailyCount = (dailyMatch[1].match(/Object\.freeze\(\{\s*id:/g) || []).length;
    assert.equal(dailyCount, 3, `Faction ${key} must have exactly 3 daily missions`);

    const seasonMatch = seasonalSection.match(new RegExp(`${keyToken}\\s*:\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)\\s*,`));
    assert.ok(seasonMatch, `Missing seasonal mission block for ${key}`);
    const seasonCount = (seasonMatch[1].match(/Object\.freeze\(\{\s*id:/g) || []).length;
    assert.ok(seasonCount >= 1, `Faction ${key} must have at least 1 seasonal mission`);
  }

  const standings = warModule.getFactionStandings();
  const standingKeys = new Set(standings.map((s) => s.faction));
  for (const key of LIVE_FACTIONS) {
    assert.ok(standingKeys.has(key), `Faction ${key} missing from faction standings`);
  }
}

function checkLeaderboardEarnPath() {
  const src = read(LEADERBOARD_FILE);
  assert.ok(src.includes('const factionEarn = await callFactionEarn("score_accept", score);'), 'Accepted score must still call faction earn');
  assert.ok(src.includes('"/faction/earn"'), 'leaderboard client must still call /faction/earn');
  assert.ok(src.includes('dispatchUiState("moonboys:faction-boost"'), 'leaderboard client must still emit faction boost UI event');
}

function checkFactionKeysInModels() {
  assertFileContainsEveryKey(ALIGNMENT_FILE, LIVE_FACTIONS);
  assertFileContainsEveryKey(EFFECTS_FILE, LIVE_FACTIONS);
  assertFileContainsEveryKey(MISSIONS_FILE, LIVE_FACTIONS);
  assertFileContainsEveryKey(WAR_FILE, LIVE_FACTIONS);
}

function checkLeaderboardWorkerFactions() {
  const src = read(LEADERBOARD_WORKER_FILE);
  // Must contain all 9 canonical faction keys so no valid submission is silently
  // downgraded to "unaligned" by an outdated allowlist.
  for (const key of LIVE_FACTIONS) {
    assert.ok(src.includes(`"${key}"`), `workers/leaderboard-worker.js is missing canonical faction key: ${key}`);
  }
  // Old 3-faction allowlist must not remain as the sole guard.
  assert.ok(
    !src.includes('["diamond-hands", "hodl-warriors", "graffpunks"]'),
    'workers/leaderboard-worker.js must not restrict faction acceptance to the old 3-faction list'
  );
}

function checkDocPerkParity() {
  const src = read(DOCS_FILE);
  assert.ok(src.includes('chaosModifier: 0.82'), 'Hard Fork Rockers doc must mention chaosModifier: 0.82');
  assert.ok(src.includes('comboModifier: 0.92'), 'Hard Fork Rockers doc must mention comboModifier: 0.92');
  assert.ok(
    src.includes('12% chaos reduction') || src.includes('chaosModifier: 0.88'),
    'Rugpull Minors doc must mention 12% chaos reduction or chaosModifier: 0.88'
  );
}

async function checkWarStateMigration() {
  const today = new Date();
  const todayKey = today.getUTCFullYear()
    + '-' + String(today.getUTCMonth() + 1).padStart(2, '0')
    + '-' + String(today.getUTCDate()).padStart(2, '0');
  const isoDow = today.getUTCDay() || 7;
  const thu = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + (4 - isoDow)));
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const weekKey = thu.getUTCFullYear() + '-W' + String(Math.ceil(((thu - yearStart) / 86400000 + 1) / 7)).padStart(2, '0');

  const localStorage = createMemoryStorage();
  localStorage.setItem('fw_war_state_v1', JSON.stringify({
    season: 7,
    updatedAt: 123456789,
    factions: {
      'hard-fork-rockers': {
        power: 4,
        daily: { [todayKey]: 4 },
        weekly: { [weekKey]: 4 },
        momentum: 1,
        contributions: { mission_complete: 4 },
      },
      'diamond-hands': {
        power: 12,
        daily: { [todayKey]: 5 },
        weekly: { [weekKey]: 7 },
        momentum: 2,
        contributions: { score_submission: 9, streak_bonus: 3 },
      },
      hodlwarriors: {
        power: 15,
        daily: { [todayKey]: 6 },
        weekly: { [weekKey]: 11 },
        momentum: 3,
        contributions: { global_event: 8, other: 2 },
      },
      'rugpull-minors': {
        power: 2,
        daily: { [todayKey]: 1 },
        weekly: { [weekKey]: 1 },
        momentum: 1,
        contributions: { mission_complete: 1 },
      },
    },
  }));

  globalThis.localStorage = localStorage;
  const warModule = await import(pathToFileURL(WAR_FILE).href + `?migration=${Date.now()}`);
  const state = warModule.getWarState();
  const stored = JSON.parse(localStorage.getItem('fw_war_state_v1'));

  assert.equal(state.factions['hard-fork-rockers'].power, 16, 'diamond-hands power must migrate into hard-fork-rockers');
  assert.equal(state.factions['hard-fork-rockers'].daily[todayKey], 9, 'diamond-hands daily totals must be preserved');
  assert.equal(state.factions['hard-fork-rockers'].weekly[weekKey], 11, 'diamond-hands weekly totals must be preserved');
  assert.equal(state.factions['hard-fork-rockers'].contributions.score_submission, 9, 'diamond-hands contributions must migrate');
  assert.equal(state.factions['hard-fork-rockers'].contributions.streak_bonus, 3, 'diamond-hands streak contributions must migrate');
  assert.equal(state.factions['hard-fork-rockers'].contributions.mission_complete, 4, 'existing hard-fork-rockers contributions must be preserved');
  assert.equal(state.factions['hard-fork-rockers'].momentum, 2, 'hard-fork-rockers momentum must preserve the stronger legacy value');

  assert.equal(state.factions['rugpull-minors'].power, 17, 'hodl-warriors power must migrate into rugpull-minors');
  assert.equal(state.factions['rugpull-minors'].daily[todayKey], 7, 'hodl-warriors daily totals must be preserved');
  assert.equal(state.factions['rugpull-minors'].weekly[weekKey], 12, 'hodl-warriors weekly totals must be preserved');
  assert.equal(state.factions['rugpull-minors'].contributions.global_event, 8, 'hodl-warriors contributions must migrate');
  assert.equal(state.factions['rugpull-minors'].contributions.other, 2, 'unknown contribution buckets must be preserved');
  assert.equal(state.factions['rugpull-minors'].contributions.mission_complete, 1, 'existing rugpull-minors contributions must be preserved');
  assert.equal(state.factions['rugpull-minors'].momentum, 3, 'rugpull-minors momentum must preserve the stronger legacy value');

  assert.ok(!('diamond-hands' in state.factions), 'legacy diamond-hands key must not remain active');
  assert.ok(!('hodlwarriors' in state.factions), 'legacy hodlwarriors key must not remain active');
  assert.ok(!('diamond-hands' in stored.factions), 'stored state must remove legacy diamond-hands key');
  assert.ok(!('hodlwarriors' in stored.factions), 'stored state must remove legacy hodlwarriors key');

  const standingKeys = new Set(warModule.getFactionStandings().map((entry) => entry.faction));
  assert.ok(!standingKeys.has('diamond-hands'), 'legacy diamond-hands must not appear in standings');
  assert.ok(!standingKeys.has('hodlwarriors'), 'legacy hodlwarriors must not appear in standings');
}

async function main() {
  checkNoOldLiveLabels();
  checkFactionKeysInModels();
  checkLeaderboardWorkerFactions();
  checkAlignmentAliases();
  checkLeaderboardEarnPath();
  checkDocPerkParity();
  await checkFactionModelsRuntime();
  await checkWarStateMigration();
  console.log('Faction canon protection checks passed.');
}

main().catch((error) => {
  console.error('Faction canon protection checks failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

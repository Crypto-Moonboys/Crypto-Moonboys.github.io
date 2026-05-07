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
  const missionModule = await import(pathToFileURL(MISSIONS_FILE).href + `?v=${Date.now()}`);
  const warModule = await import(pathToFileURL(WAR_FILE).href + `?v=${Date.now()}`);

  for (const key of LIVE_FACTIONS) {
    const fx = effectModule.getFactionEffects(key);
    assert.ok(fx && fx.key === key, `Missing faction effect definition for ${key}`);
  }

  for (const key of LIVE_FACTIONS) {
    const daily = missionModule.getDailyMissions(key);
    const seasonal = missionModule.getSeasonalMissions(key);
    assert.equal(daily.length, 3, `Faction ${key} must have exactly 3 daily missions`);
    assert.ok(seasonal.length >= 1, `Faction ${key} must have at least 1 seasonal mission`);
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

async function main() {
  checkNoOldLiveLabels();
  checkFactionKeysInModels();
  checkAlignmentAliases();
  checkLeaderboardEarnPath();
  await checkFactionModelsRuntime();
  console.log('Faction canon protection checks passed.');
}

main().catch((error) => {
  console.error('Faction canon protection checks failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

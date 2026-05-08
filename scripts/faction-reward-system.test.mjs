/**
 * faction-reward-system.test.mjs
 *
 * CI guard for the Faction Reward System (PR4).
 *
 * Verifies:
 *   1. New reward system exists and has required functions + faction keys
 *   2. Reward data coverage for all 9 factions
 *   3. Bridge wiring — imports reward system, sets window global, dispatches event
 *   4. Hub wiring — battle-chamber-factions.js reads MOONBOYS_FACTION_REWARD_DATA
 *      and community.html includes reward/perk section copy
 *   5. Faction page wiring — faction-chamber-page.js reads MOONBOYS_FACTION_REWARD_DATA
 *      and faction pages include reward/perk hook containers
 *   6. Safety — no forbidden reward language, no XP math changes, no submitScore
 *   7. Existing systems preserved
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  [PASS] ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`);
  failed++;
}

function check(condition, label, detail) {
  if (condition) {
    pass(label);
  } else {
    fail(label, detail);
  }
}

function read(relPath) {
  const absPath = path.join(ROOT, relPath.replace(/^\//, ''));
  return fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : '';
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath.replace(/^\//, '')));
}

console.log('\n─── Faction Reward System Tests (PR4) ─────────────────────────\n');

// ── File paths ────────────────────────────────────────────────────────────────

const REWARD_SYSTEM_FILE = 'js/arcade/systems/faction-reward-system.js';
const BRIDGE_FILE = 'js/battle-chamber-faction-bridge.js';
const HUB_RENDERER_FILE = 'js/battle-chamber-factions.js';
const CHAMBER_PAGE_FILE = 'js/faction-chamber-page.js';
const COMMUNITY_HTML_FILE = 'community.html';

const LIVE_FACTION_KEYS = [
  'hard-fork-rockers',
  'rugpull-minors',
  'graffpunks',
  'blockchain-furies',
  'crypto-moongirls',
  'blockstars',
  'all-city-bulls',
  'nomad-bears',
  'crypto-stoned-boys',
];

const FACTION_PAGE_FILES = LIVE_FACTION_KEYS.map(
  (k) => `/battle-chamber/factions/${k}.html`
);

const REQUIRED_REWARD_FUNCTIONS = [
  'getFactionRewardState',
  'getWeeklyFactionRewards',
  'getMonthlyFactionRewards',
  'getSeasonalFactionRewards',
  'getFactionTitleTrack',
  'getFactionBadgeTrack',
  'getFactionStickerTrack',
  'getUnlockedRoguelitePerks',
  'getFactionRewardSummary',
];

const FORBIDDEN_REWARD_TERMS = [
  'passive income',
  'guaranteed rewards',
  'guaranteed reward',
  'token rewards',
  'token reward',
  'financial rewards',
  'financial reward',
  'investment return',
  'earn money',
  'cash prizes',
  'cash prize',
];

// ── 1. New reward system exists ───────────────────────────────────────────────

console.log('[1] New reward system exists');

check(exists(REWARD_SYSTEM_FILE), `${REWARD_SYSTEM_FILE} exists`);

const rewardSystemJs = read(REWARD_SYSTEM_FILE);

for (const fn of REQUIRED_REWARD_FUNCTIONS) {
  check(
    rewardSystemJs.includes(fn),
    `reward system exports/defines: ${fn}`
  );
}

// All 9 canonical faction keys must be present
console.log('\n[1b] Reward system includes all 9 faction keys');
for (const key of LIVE_FACTION_KEYS) {
  check(rewardSystemJs.includes(`'${key}'`), `reward system includes faction key: ${key}`);
}

// ── 2. Reward data coverage ───────────────────────────────────────────────────

console.log('\n[2] Reward data coverage — every faction has required tracks');

// Import and execute the module to test runtime data
let rewardModule = null;
try {
  rewardModule = await import(path.join(ROOT, REWARD_SYSTEM_FILE) + '?t=' + Date.now());
} catch (err) {
  fail('reward system can be imported in Node.js', String(err));
}

if (rewardModule) {
  const {
    FACTION_REWARD_DEFS,
    getWeeklyFactionRewards,
    getMonthlyFactionRewards,
    getSeasonalFactionRewards,
    getFactionTitleTrack,
    getFactionBadgeTrack,
    getFactionStickerTrack,
    getUnlockedRoguelitePerks,
    getFactionRewardSummary,
    LIVE_FACTION_REWARD_KEYS,
  } = rewardModule;

  check(typeof FACTION_REWARD_DEFS === 'object' && FACTION_REWARD_DEFS !== null, 'FACTION_REWARD_DEFS is exported');
  check(Array.isArray(LIVE_FACTION_REWARD_KEYS), 'LIVE_FACTION_REWARD_KEYS is exported as array');

  for (const key of LIVE_FACTION_KEYS) {
    const weekly = getWeeklyFactionRewards(key);
    check(weekly !== null && typeof weekly === 'object', `${key}: has weekly reward`);
    check(weekly && typeof weekly.badge === 'string', `${key}: weekly reward has badge`);

    const monthly = getMonthlyFactionRewards(key);
    check(monthly !== null && typeof monthly === 'object', `${key}: has monthly reward`);
    check(monthly && typeof monthly.title === 'string', `${key}: monthly reward has title`);

    const seasonal = getSeasonalFactionRewards(key);
    check(seasonal !== null && typeof seasonal === 'object', `${key}: has seasonal reward`);
    check(seasonal && typeof seasonal.trophy === 'string', `${key}: seasonal reward has trophy`);

    const badges = getFactionBadgeTrack(key);
    check(Array.isArray(badges) && badges.length > 0, `${key}: has badge track`);

    const stickers = getFactionStickerTrack(key);
    check(Array.isArray(stickers) && stickers.length > 0, `${key}: has sticker track`);

    const titles = getFactionTitleTrack(key);
    check(Array.isArray(titles) && titles.length > 0, `${key}: has title track`);

    const roguelite = getUnlockedRoguelitePerks(key);
    check(Array.isArray(roguelite) && roguelite.length > 0, `${key}: has roguelite perk eligibility`);

    const summary = getFactionRewardSummary(key);
    check(summary && summary.factionId === key, `${key}: getFactionRewardSummary returns correct factionId`);
    check(summary && summary.weekly !== null, `${key}: summary includes weekly`);
    check(summary && summary.monthly !== null, `${key}: summary includes monthly`);
    check(summary && summary.seasonal !== null, `${key}: summary includes seasonal`);
  }

  // Faction-specific badges/titles/trophies
  console.log('\n[2b] Faction-specific reward flavour');
  const specificChecks = [
    { key: 'hard-fork-rockers',   weeklyBadge: 'Long Run Survivor',     monthlyTitle: 'Chainbreaker Headliner', trophy: 'Fork Amplifier' },
    { key: 'rugpull-minors',      weeklyBadge: 'Deep Shaft Survivor',    monthlyTitle: 'Rugproof Captain',       trophy: 'Vault Miner' },
    { key: 'graffpunks',          weeklyBadge: 'Chaos Tagger',           monthlyTitle: 'All-City Burner',        trophy: 'Wall King' },
    { key: 'blockchain-furies',   weeklyBadge: 'Fury Spark',             monthlyTitle: 'Chain Striker',          trophy: 'Storm Node' },
    { key: 'crypto-moongirls',    weeklyBadge: 'Lunar Signal',           monthlyTitle: 'Moon Commander',         trophy: "Queen's Crest" },
    { key: 'blockstars',          weeklyBadge: 'Spotlight Runner',       monthlyTitle: 'Headline Icon',          trophy: 'Star Block' },
    { key: 'all-city-bulls',      weeklyBadge: 'Board Smasher',          monthlyTitle: 'All-City Charger',       trophy: 'Bull Horn Crown' },
    { key: 'nomad-bears',         weeklyBadge: 'Route Walker',           monthlyTitle: 'Path King',              trophy: 'Compass Heavy' },
    { key: 'crypto-stoned-boys',  weeklyBadge: 'Weird Luck',             monthlyTitle: 'Cosmic Couch Boss',      trophy: 'Haze Dice' },
  ];
  for (const sc of specificChecks) {
    const w = getWeeklyFactionRewards(sc.key);
    const m = getMonthlyFactionRewards(sc.key);
    const s = getSeasonalFactionRewards(sc.key);
    check(w && w.badge === sc.weeklyBadge, `${sc.key}: correct weekly badge "${sc.weeklyBadge}"`);
    check(m && m.title === sc.monthlyTitle, `${sc.key}: correct monthly title "${sc.monthlyTitle}"`);
    check(s && s.trophy === sc.trophy, `${sc.key}: correct seasonal trophy "${sc.trophy}"`);
  }
}

// ── 3. Bridge wiring ──────────────────────────────────────────────────────────

console.log('\n[3] Bridge wiring');

const bridgeJs = read(BRIDGE_FILE);
check(bridgeJs.includes('faction-reward-system.js'), 'bridge imports faction-reward-system.js');
check(bridgeJs.includes('getFactionRewardSummary'), 'bridge imports getFactionRewardSummary');
check(bridgeJs.includes('window.MOONBOYS_FACTION_REWARD_DATA'), 'bridge assigns window.MOONBOYS_FACTION_REWARD_DATA');
check(bridgeJs.includes('battle-chamber:faction-rewards-ready'), 'bridge dispatches battle-chamber:faction-rewards-ready');

// Existing bridge globals still present
check(bridgeJs.includes('window.MOONBOYS_WAR_DATA'), 'bridge still assigns window.MOONBOYS_WAR_DATA');
check(bridgeJs.includes('window.MOONBOYS_MISSION_DATA'), 'bridge still assigns window.MOONBOYS_MISSION_DATA');
check(bridgeJs.includes('window.FACTION_EFFECT_DEFS'), 'bridge still assigns window.FACTION_EFFECT_DEFS');
check(bridgeJs.includes('battle-chamber:faction-data-ready'), 'bridge still dispatches battle-chamber:faction-data-ready');

// ── 4. Hub wiring ─────────────────────────────────────────────────────────────

console.log('\n[4] Hub wiring');

const hubJs = read(HUB_RENDERER_FILE);
check(hubJs.includes('MOONBOYS_FACTION_REWARD_DATA'), 'battle-chamber-factions.js reads MOONBOYS_FACTION_REWARD_DATA');
check(hubJs.includes('battle-faction-reward-unlocks'), 'battle-chamber-factions.js targets battle-faction-reward-unlocks container');
check(hubJs.includes('renderFactionRewardUnlocks'), 'battle-chamber-factions.js defines renderFactionRewardUnlocks');
check(hubJs.includes('battle-chamber:faction-rewards-ready'), 'battle-chamber-factions.js listens for battle-chamber:faction-rewards-ready');

const communityHtml = read(COMMUNITY_HTML_FILE);
check(communityHtml.includes('battle-faction-reward-unlocks'), 'community.html includes battle-faction-reward-unlocks container');
check(communityHtml.includes('Win the week. Own the chamber.'), 'community.html includes copy: "Win the week. Own the chamber."');
check(communityHtml.includes('Monthly clout puts your faction on the board.'), 'community.html includes copy: "Monthly clout puts your faction on the board."');
check(communityHtml.includes('Seasonal winners become part of the Battle Chamber record.'), 'community.html includes copy: "Seasonal winners become part of the Battle Chamber record."');
check(communityHtml.includes('Badges, stickers, titles, and roguelite options prove your faction moved.'), 'community.html includes copy: "Badges, stickers, titles, and roguelite options prove your faction moved."');
check(communityHtml.includes('Faction rewards are gameplay/status rewards only.'), 'community.html includes copy: "Faction rewards are gameplay/status rewards only."');

// ── 5. Faction page wiring ────────────────────────────────────────────────────

console.log('\n[5] Faction page wiring');

const chamberPageJs = read(CHAMBER_PAGE_FILE);
check(chamberPageJs.includes('MOONBOYS_FACTION_REWARD_DATA'), 'faction-chamber-page.js reads MOONBOYS_FACTION_REWARD_DATA');
check(chamberPageJs.includes('fcp-reward-tracks'), 'faction-chamber-page.js renders fcp-reward-tracks hook');
check(chamberPageJs.includes('battle-chamber:faction-rewards-ready'), 'faction-chamber-page.js listens for battle-chamber:faction-rewards-ready');

for (const route of FACTION_PAGE_FILES) {
  const html = read(route);
  check(html.includes('fcp-reward-tracks'), `${route}: includes fcp-reward-tracks hook container`);
}

// ── 6. Safety checks ─────────────────────────────────────────────────────────

console.log('\n[6] Safety checks — forbidden reward language');

const rewardSystemLower = rewardSystemJs.toLowerCase();
for (const term of FORBIDDEN_REWARD_TERMS) {
  check(!rewardSystemLower.includes(term.toLowerCase()), `reward system does not contain: "${term}"`);
}

console.log('\n[6b] Safety checks — XP math and score integrity');

check(!rewardSystemJs.match(/submitScore\s*\(/), 'reward system does not call submitScore()');
check(!rewardSystemJs.match(/queuePendingProgress\s*\(/), 'reward system does not call ArcadeSync.queuePendingProgress()');
check(!rewardSystemJs.match(/ArcadeSync\s*\./), 'reward system does not reference ArcadeSync methods');
check(!rewardSystemJs.includes('earnFactionXp'), 'reward system does not call earnFactionXp() directly');

// xpModifier must not be used in math — the system should not reference it at all
// (xpModifier lives in faction-effect-system.js and is display-only there too)
check(!rewardSystemJs.includes('xpModifier * ') && !rewardSystemJs.includes('* xpModifier'), 'reward system does not multiply xpModifier in math');

// No forbidden hub wording
const hubLower = hubJs.toLowerCase();
for (const term of FORBIDDEN_REWARD_TERMS) {
  check(!hubLower.includes(term.toLowerCase()), `battle-chamber-factions.js does not contain: "${term}"`);
}

// No forbidden chamber page wording
const chamberPageLower = chamberPageJs.toLowerCase();
for (const term of FORBIDDEN_REWARD_TERMS) {
  check(!chamberPageLower.includes(term.toLowerCase()), `faction-chamber-page.js does not contain: "${term}"`);
}

// No forbidden wording in community.html
const communityLower = communityHtml.toLowerCase();
for (const term of FORBIDDEN_REWARD_TERMS) {
  check(!communityLower.includes(term.toLowerCase()), `community.html does not contain: "${term}"`);
}

// ── 7. Existing systems preserved ────────────────────────────────────────────

console.log('\n[7] Existing systems preserved');

check(exists('js/faction-alignment.js'), 'js/faction-alignment.js exists');
check(exists('js/arcade/systems/faction-missions.js'), 'js/arcade/systems/faction-missions.js exists');
check(exists('js/arcade/systems/faction-war-system.js'), 'js/arcade/systems/faction-war-system.js exists');
check(exists('js/arcade/systems/faction-effect-system.js'), 'js/arcade/systems/faction-effect-system.js exists');

const factionAlignmentJs = read('js/faction-alignment.js');
check(factionAlignmentJs.includes('joinFaction'), 'faction-alignment.js still exports joinFaction');
check(factionAlignmentJs.includes('loadStatus'), 'faction-alignment.js still exports loadStatus');
check(factionAlignmentJs.includes('earnFactionXp'), 'faction-alignment.js still exports earnFactionXp');

const effectSystemJs = read('js/arcade/systems/faction-effect-system.js');
check(effectSystemJs.includes('xpModifier'), 'faction-effect-system.js still defines xpModifier (metadata)');
check(effectSystemJs.includes('FACTION_DEFS'), 'faction-effect-system.js still exports FACTION_DEFS');

// Bridge still exposes all required existing globals
check(bridgeJs.includes('window.MOONBOYS_WAR_DATA'), 'bridge still exposes MOONBOYS_WAR_DATA');
check(bridgeJs.includes('window.MOONBOYS_MISSION_DATA'), 'bridge still exposes MOONBOYS_MISSION_DATA');
check(bridgeJs.includes('window.FACTION_EFFECT_DEFS'), 'bridge still exposes FACTION_EFFECT_DEFS');

// Battle Chamber hub links all faction chamber pages
for (const key of LIVE_FACTION_KEYS) {
  check(
    communityHtml.includes(`/battle-chamber/factions/${key}.html`),
    `community.html still links to faction chamber: ${key}`
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n─── Result ─────────────────────────────────────────────────────');
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);
console.log('────────────────────────────────────────────────────────────────\n');

if (failed > 0) {
  console.error(`Faction reward system tests FAILED (${failed} failure${failed !== 1 ? 's' : ''}).`);
  process.exit(1);
}

console.log('Faction reward system tests PASSED.');

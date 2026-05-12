/**
 * faction-season-lock.test.mjs
 *
 * Tests for the faction season lock feature (PR 6 + PR 6 follow-up).
 *
 * Coverage:
 *   1. Frontend join flow (source-level checks on battle-chamber-factions.js)
 *   2. Server season lock — atomic, race-safe, backfill (worker.js)
 *   3. Bot /gkfaction copy (worker.js)
 *   4. Preservation — existing faction routes / earn / status still present
 *   5. Migration file exists with correct schema, no redundant index
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
  console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

function check(condition, label, detail) {
  if (condition) pass(label);
  else fail(label, detail);
}

function read(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
}

// ── Source files ──────────────────────────────────────────────────────────────

const bcFactions   = read('js/battle-chamber-factions.js');
const alignment    = read('js/faction-alignment.js');
const worker       = read('workers/moonboys-api/worker.js');
const factionCanon = read('workers/moonboys-api/shared/faction-canon.js');
const migration017 = read('workers/moonboys-api/migrations/017_faction_season_lock.sql');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Frontend join flow
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── 1. Frontend join flow ────────────────────────────────────────────────');

check(
  bcFactions.includes('isTelegramLinked'),
  'Unlinked check: isTelegramLinked is called before join',
);

check(
  bcFactions.includes("'/gkniftyheads-incubator.html'") ||
  bcFactions.includes('"/gkniftyheads-incubator.html"'),
  'Unlinked user: redirected to incubator CTA when not linked',
);

check(
  !bcFactions.includes('joinFaction') ||
  bcFactions.indexOf('joinFaction') > bcFactions.indexOf('isTelegramLinked'),
  'joinFaction is only called after linked check (not before)',
);

check(
  bcFactions.includes('Confirm faction choice') ||
  bcFactions.includes('bc-join-confirm-panel') ||
  bcFactions.includes('bc-join-confirm-title'),
  'Linked user: confirmation panel is shown before join is executed',
);

check(
  bcFactions.includes('bc-confirm-join') || bcFactions.includes('Confirm — Join'),
  'Confirmation panel has a confirm button',
);

check(
  bcFactions.includes('bc-cancel-join') || bcFactions.includes('Cancel'),
  'Confirmation panel has a cancel button',
);

check(
  bcFactions.includes("api.joinFaction(targetFaction)"),
  'Confirm calls api.joinFaction(targetFaction)',
);

check(
  bcFactions.includes('moonboys:faction-status') &&
  (bcFactions.includes('loadStatus') || bcFactions.includes('dispatchEvent')),
  'After successful join, faction status event is dispatched / re-rendered',
);

check(
  bcFactions.includes('Your faction clout now counts for this season') ||
  bcFactions.includes('clout now counts'),
  'Success message shown after joining',
);

check(
  bcFactions.includes('faction_locked_for_season') ||
  (bcFactions.includes('locked') && bcFactions.includes('Faction switch blocked')),
  'faction_locked_for_season error path: shows blocked message',
);

check(
  bcFactions.includes('Faction backend is updating. Your Telegram link is active, but faction join is temporarily unavailable. Try again after deployment.'),
  'Frontend: 503/backend unavailable join path shows explicit deployment-in-progress message',
);

// ── faction-alignment.js Error.message priority ───────────────────────────────
// The request() helper must use data.message first so human-readable server text
// surfaces to callers, while error.code preserves the machine-readable code.
check(
  (function () {
    // Must use data.message before data.error for the Error constructor argument.
    // Accept both: `(data && data.message) || data.error` or `data?.message || data.error`.
    return /new Error\(\(?data(\s*&&\s*data)?\.message\)?\s*\|\|\s*data\.error/.test(alignment) ||
           alignment.includes('data.message) || data.error') ||
           alignment.includes('data.message || data.error');
  })(),
  'faction-alignment.js: Error.message uses data.message before data.error (human-readable text first)',
);

check(
  (function () {
    // error.code must be set to data.error (machine-readable code), NOT data.message.
    const codeAssign = alignment.match(/error\.code\s*=\s*([^;]+)/);
    if (!codeAssign) return false;
    const rhs = codeAssign[1].trim();
    // Must contain data.error, must NOT contain data.message.
    return rhs.includes('data.error') && !rhs.includes('data.message');
  })(),
  'faction-alignment.js: error.code is set to data.error (machine-readable code), not data.message',
);

check(
  (function () {
    // isBackendUnavailable must detect missing_required_table via errCode,
    // not by searching errMsg, so the human-readable message does not interfere.
    return bcFactions.includes("errCode === 'missing_required_table'");
  })(),
  'Frontend: isBackendUnavailable detects missing_required_table via errCode (not errMsg)',
);

check(
  bcFactions.includes('You are locked to') && bcFactions.includes('for this season'),
  'Aligned user sees season lock message',
);

check(
  bcFactions.includes('Your runs, missions, and proof events'),
  'Aligned user sees clout contribution note',
);

check(
  bcFactions.includes('View Faction Chamber') || bcFactions.includes('bc-cta-chamber'),
  'Aligned user has faction chamber link',
);

check(
  bcFactions.includes('Choose carefully. Your faction is locked for the current season'),
  'Unaligned panel shows season lock warning copy',
);

check(
  bcFactions.includes('At season reset') || bcFactions.includes('season lock clears'),
  'Unaligned panel shows season reset copy',
);

check(
  bcFactions.includes('Faction clout only counts when you are Telegram-linked'),
  'Unaligned panel shows Telegram-link requirement',
);

check(
  bcFactions.includes('No faction, no faction clout'),
  'Unaligned panel shows no-faction warning',
);

// season_key merged into dispatched status when loadStatus() doesn't return it
check(
  bcFactions.includes('season_key') &&
  (bcFactions.includes("freshStatus.season_key ? freshStatus") ||
   bcFactions.includes('Object.assign') && bcFactions.includes('season_key: seasonKey')),
  'Frontend: season_key is merged into dispatched status when loadStatus() does not return it',
);

// "Next reset: Season: ..." wording must NOT appear
check(
  !bcFactions.includes("'Season: '") &&
  !bcFactions.includes('"Season: "') &&
  !bcFactions.includes('Next reset: <strong>Season:'),
  'Frontend: aligned panel does not show "Next reset: Season: ..." (confusing wording fixed)',
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Server season lock — atomic, race-safe, backfill (worker.js)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── 2. Server season lock (atomic + backfill) ────────────────────────────');

check(
  migration017.includes('telegram_faction_season_locks'),
  'Migration 017: telegram_faction_season_locks table created',
);

check(
  migration017.includes('telegram_id') &&
  migration017.includes('season_key') &&
  migration017.includes('faction_id'),
  'Migration 017: required columns present (telegram_id, season_key, faction_id)',
);

check(
  migration017.includes('UNIQUE') &&
  (migration017.includes('telegram_id, season_key') ||
   migration017.includes('(telegram_id, season_key)')),
  'Migration 017: UNIQUE constraint on (telegram_id, season_key)',
);

check(
  migration017.includes('locked_at') && migration017.includes('updated_at'),
  'Migration 017: locked_at and updated_at columns present',
);

// Redundant index must be removed
check(
  !migration017.includes('CREATE INDEX') &&
  !migration017.includes('idx_faction_season_locks_telegram'),
  'Migration 017: no redundant index on (telegram_id, season_key) — UNIQUE already covers it',
);

check(
  worker.includes("'telegram_faction_season_locks'"),
  'Worker: /faction/join checks telegram_faction_season_locks table',
);

check(
  worker.includes("error: 'missing_required_table'") &&
  worker.includes('migration_pending:blocktopia_progression_faction_columns'),
  'Worker: /faction/join returns explicit missing_required_table payload when required schema is pending',
);

check(
  worker.includes('faction_locked_for_season'),
  'Worker: /faction/join returns faction_locked_for_season error code',
);

check(
  worker.includes('existingLock.faction_id === requestedFaction') ||
  worker.includes("existingLock?.faction_id === requestedFaction"),
  'Worker: same faction join is idempotent (allowed)',
);

check(
  worker.includes('409') && worker.includes('faction_locked_for_season'),
  'Worker: different faction same season returns 409 faction_locked_for_season',
);

check(
  worker.includes("locked_until: 'next season reset'"),
  'Worker: response includes locked_until field',
);

check(
  worker.includes('season_key: seasonKey'),
  'Worker: response includes season_key field',
);

check(
  worker.includes('getBattleSeasonKey'),
  'Worker: uses getBattleSeasonKey() for season determination',
);

// ── Atomic / race-safe: must use DO NOTHING, not DO UPDATE SET faction_id ────
check(
  !worker.includes('DO UPDATE SET faction_id = excluded.faction_id'),
  'Worker: season lock insert does NOT use DO UPDATE SET faction_id (race-safe — first-choice-wins)',
);

check(
  worker.includes('DO NOTHING'),
  'Worker: season lock insert uses ON CONFLICT DO NOTHING (first-writer-wins)',
);

// Re-read after insert to detect race
check(
  (function () {
    // The re-read pattern: after INSERT DO NOTHING, worker reads back the stored lock
    // and returns 409 if the stored faction differs from requestedFaction.
    const insertIdx = worker.lastIndexOf('DO NOTHING');
    const reReadPattern = worker.indexOf('storedLock', insertIdx);
    return insertIdx !== -1 && reReadPattern !== -1;
  })(),
  'Worker: re-reads stored lock after INSERT DO NOTHING to detect concurrent race',
);

check(
  worker.includes('storedLock') && worker.includes('storedLock.faction_id !== requestedFaction'),
  'Worker: if stored lock faction differs from requested, returns 409 (race detection)',
);

// ── Backfill: existing non-unaligned users are locked to their current faction ─
check(
  worker.includes('existingFaction') &&
  worker.includes('existingFaction !== FACTION_UNALIGNED'),
  'Worker: checks existing progression faction for backfill (non-unaligned users)',
);

check(
  (function () {
    // Backfill: INSERT DO NOTHING for existingFaction when existingFaction != UNALIGNED
    const backfillBlock = worker.indexOf('Backfill');
    return backfillBlock !== -1 && worker.indexOf('DO NOTHING', backfillBlock) !== -1;
  })(),
  'Worker: backfills lock for existing non-unaligned faction before allowing fresh join',
);

check(
  (function () {
    // After backfill, if requestedFaction !== storedFaction → 409
    const backfillIdx = worker.indexOf('Backfill');
    const block = worker.slice(backfillIdx, backfillIdx + 2500);
    return block.includes('faction_locked_for_season') &&
           (block.includes('storedFaction') || block.includes('storedFactionId'));
  })(),
  'Worker: existing user cannot switch faction during season (backfill path returns 409)',
);

check(
  (function () {
    // After backfill, if requestedFaction === storedFaction → idempotent 200
    const backfillIdx = worker.indexOf('Backfill');
    const block = worker.slice(backfillIdx, backfillIdx + 1500);
    return block.includes('ok: true') && block.includes('storedFaction');
  })(),
  'Worker: existing user re-joining same faction is idempotent (backfill path)',
);

// ── Progression update after lock confirmed ────────────────────────────────
check(
  (function () {
    // UPDATE blocktopia_progression should appear AFTER the lock insert logic
    const lockInsertIdx = worker.indexOf('ON CONFLICT(telegram_id, season_key) DO NOTHING');
    const progressionUpdateIdx = worker.lastIndexOf('UPDATE blocktopia_progression');
    // The last progression UPDATE should come after the last lock insert
    return progressionUpdateIdx > lockInsertIdx;
  })(),
  'Worker: progression is updated only after season lock is confirmed (race-safe ordering)',
);

// Worker must import shared faction canon module (single source of truth)
check(
  worker.includes("from './shared/faction-canon.js'"),
  'Worker: imports shared faction canon module',
);

check(
  worker.includes('normalizeFaction'),
  'Worker: uses shared normalizeFaction',
);

check(
  !worker.includes('function normalizeFaction('),
  'Worker: does not define local normalizeFaction',
);

check(
  !worker.includes('const CANONICAL_FACTIONS = ['),
  'Worker: does not define separate local canonical faction list',
);

check(
  !worker.includes('const BATTLE_CHAMBER_FACTION_ALIASES ='),
  'Worker: does not define separate Battle Chamber alias map',
);

// Shared canon module must define all 9 canonical keys
const allNineKeys = [
  'hard-fork-rockers', 'rugpull-miners', 'graffpunks', 'blockchain-furies',
  'crypto-moongirls', 'blockstars', 'all-city-bulls', 'nomad-bears', 'crypto-stoned-boys',
];
allNineKeys.forEach(function (key) {
  check(
    factionCanon.includes("'" + key + "'") || factionCanon.includes('"' + key + '"'),
    'Shared canon: includes canonical faction key - ' + key,
  );
});

// Legacy aliases must map to canonical in shared module
check(
  /["']diamond-hands["']\s*:\s*["']hard-fork-rockers["']/.test(factionCanon),
  'Shared canon: diamond-hands alias maps to hard-fork-rockers',
);

check(
  /["']hodl-warriors["']\s*:\s*["']rugpull-miners["']/.test(factionCanon),
  'Shared canon: hodl-warriors alias maps to rugpull-miners',
);

check(
  /["']rugpull-minors["']\s*:\s*["']rugpull-miners["']/.test(factionCanon),
  'Shared canon: rugpull-minors alias maps to rugpull-miners',
);

check(
  /["']graff-punks["']\s*:\s*["']graffpunks["']/.test(factionCanon),
  'Shared canon: graff-punks alias maps to graffpunks',
);
// 3. Bot /gkfaction copy
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── 3. Bot /gkfaction copy ───────────────────────────────────────────────');

check(
  worker.includes('cmdGkFaction'),
  'Bot: /gkfaction handler (cmdGkFaction) still exists',
);

check(
  !worker.includes('To join a faction:\n') &&
  !worker.includes('gkfaction &lt;name&gt;'),
  'Bot: /gkfaction no longer instructs users to join via bot command',
);

check(
  worker.includes('community.html#battle-join-faction'),
  'Bot: /gkfaction includes Battle Chamber join page link',
);

check(
  worker.includes("Your choice locks for the current season") ||
  worker.includes("locked for the current season") ||
  worker.includes("locked to this faction for the current season"),
  'Bot: /gkfaction message includes season lock information',
);

check(
  worker.includes('No faction, no faction clout'),
  'Bot: /gkfaction message includes no-faction warning',
);

check(
  worker.includes('Open Battle Chamber'),
  'Bot: /gkfaction includes Open Battle Chamber inline button',
);

// cmdGkStart and cmdGkHelp copy updated
check(
  !worker.includes('Join or view your faction') &&
  (worker.includes('View faction status') || worker.includes('choose on the website') ||
   worker.includes('choose in Battle Chamber')),
  'Bot: cmdGkStart/cmdGkHelp no longer says "Join or view your faction"',
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Preservation — existing faction routes still intact
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── 4. Preservation ──────────────────────────────────────────────────────');

check(
  worker.includes("path === '/faction/status'"),
  'Preservation: /faction/status route still present',
);

check(
  worker.includes("path === '/faction/earn'"),
  'Preservation: /faction/earn route still present',
);

check(
  worker.includes("path === '/faction/join'"),
  'Preservation: /faction/join route still present',
);

check(
  !worker.includes("Faction progression schema is pending migration', 503"),
  'Preservation: /faction/join no longer returns generic schema-pending 503 string',
);

check(
  worker.includes('earnFactionXp') || worker.includes('faction_xp_awarded') || worker.includes('/faction/earn'),
  'Preservation: faction earn XP path still present',
);

check(
  worker.includes('score_accept'),
  'Preservation: accepted-score faction earn event type still present',
);

check(
  worker.includes('battle_chamber_faction_clout'),
  'Preservation: Battle Chamber faction clout table still referenced',
);

check(
  !worker.includes('Arcade XP formula changed') &&
  !worker.includes('xp_multiplier: 0'),
  'Preservation: no XP multiplier zeroed out',
);

// alignment.js still has joinFaction, loadStatus, earnFactionXp
check(
  alignment.includes('joinFaction') && alignment.includes('loadStatus') && alignment.includes('earnFactionXp'),
  'Preservation: faction-alignment.js still has joinFaction, loadStatus, earnFactionXp',
);

check(
  alignment.includes('MOONBOYS_FACTION'),
  'Preservation: MOONBOYS_FACTION still exported from faction-alignment.js',
);

// battle-chamber-factions.js still exports BATTLE_CHAMBER_FACTIONS
check(
  bcFactions.includes('BATTLE_CHAMBER_FACTIONS'),
  'Preservation: BATTLE_CHAMBER_FACTIONS still exported',
);

check(
  bcFactions.includes('renderJoinFaction') &&
  bcFactions.includes('renderActiveMissions') &&
  bcFactions.includes('renderStandings'),
  'Preservation: Battle Chamber renderer functions still present',
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. No forbidden wording added
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── 5. No forbidden wording ──────────────────────────────────────────────');

const FORBIDDEN_IN_BC = ['token reward', 'passive income', 'financial reward', 'earn money'];
FORBIDDEN_IN_BC.forEach(function (term) {
  check(
    !bcFactions.toLowerCase().includes(term.toLowerCase()),
    'No forbidden wording in battle-chamber-factions.js: "' + term + '"',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Block Topia routes.js — faction canon compliance
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── 6. Block Topia routes.js faction canon ───────────────────────────────');

const blockTopiaRoutes = read('workers/moonboys-api/blocktopia/routes.js');

// Shared faction canon is now centralized in workers/moonboys-api/shared/faction-canon.js.
// worker.js and blocktopia/routes.js must import that module rather than redefining canon locally.

check(
  blockTopiaRoutes.includes("from '../shared/faction-canon.js'"),
  'routes.js: imports shared faction canon module',
);

check(
  blockTopiaRoutes.includes('normalizeFaction') &&
  blockTopiaRoutes.includes('getFactionXpMultiplier'),
  'routes.js: uses shared normalizeFaction and XP multiplier helper',
);

check(
  !blockTopiaRoutes.includes('const BLOCKTOPIA_CANONICAL_FACTIONS = ['),
  'routes.js: does not define local canonical faction list',
);

check(
  !blockTopiaRoutes.includes('const BLOCKTOPIA_FACTION_ALIASES = {'),
  'routes.js: does not define local alias map',
);

check(
  !blockTopiaRoutes.includes('const BLOCKTOPIA_FACTION_XP_MULTIPLIERS = {'),
  'routes.js: does not define local faction XP multipliers',
);

// normalizeFaction must NOT return legacy keys as canonical
check(
  !blockTopiaRoutes.includes("return 'diamond-hands'") &&
  !blockTopiaRoutes.includes('return "diamond-hands"'),
  'routes.js: normalizeFaction must not return diamond-hands as a canonical key',
);

check(
  !blockTopiaRoutes.includes("return 'hodl-warriors'") &&
  !blockTopiaRoutes.includes('return "hodl-warriors"'),
  'routes.js: normalizeFaction must not return hodl-warriors as a canonical key',
);

// Legacy aliases must map to canonical keys
check(
  /["']diamond-hands["']\s*:\s*["']hard-fork-rockers["']/.test(factionCanon),
  'shared canon: diamond-hands alias maps to hard-fork-rockers',
);

check(
  /["']hodl-warriors["']\s*:\s*["']rugpull-miners["']/.test(factionCanon),
  'shared canon: hodl-warriors alias maps to rugpull-miners',
);

check(
  /["']rugpull-minors["']\s*:\s*["']rugpull-miners["']/.test(factionCanon),
  'shared canon: rugpull-minors alias maps to rugpull-miners',
);

// factionXpMultiplier must not reference legacy keys
check(
  !blockTopiaRoutes.includes("key === 'diamond-hands'") &&
  !blockTopiaRoutes.includes('key === "diamond-hands"'),
  'routes.js: factionXpMultiplier must not branch on diamond-hands',
);

check(
  !blockTopiaRoutes.includes("key === 'hodl-warriors'") &&
  !blockTopiaRoutes.includes('key === "hodl-warriors"'),
  'routes.js: factionXpMultiplier must not branch on hodl-warriors',
);

// All 9 canonical keys must be present in shared canon module
const CANONICAL_NINE = [
  'hard-fork-rockers', 'rugpull-miners', 'graffpunks', 'blockchain-furies',
  'crypto-moongirls', 'blockstars', 'all-city-bulls', 'nomad-bears', 'crypto-stoned-boys',
];
CANONICAL_NINE.forEach(function (key) {
  check(
    factionCanon.includes("'" + key + "'") || factionCanon.includes('"' + key + '"'),
    'shared canon: canonical faction key present -> ' + key,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. worker.js XP multiplier source-of-truth
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── 7. worker.js XP multiplier source-of-truth ───────────────────────────');

// worker.js must not duplicate xpMultiplier values inside FACTION_CONFIG.
// Detect `xpMultiplier:` as a key inside the FACTION_CONFIG block.
const factionConfigStart = worker.indexOf('const FACTION_CONFIG');
const factionConfigEnd = factionConfigStart === -1 ? -1 : worker.indexOf('};', factionConfigStart);
const factionConfigBlock =
  factionConfigStart === -1 || factionConfigEnd === -1
    ? ''
    : worker.slice(factionConfigStart, factionConfigEnd + 2);

check(
  factionConfigBlock !== '' && !/xpMultiplier\s*:/.test(factionConfigBlock),
  'worker.js: FACTION_CONFIG must not contain duplicated xpMultiplier values',
);

// worker.js must import getFactionXpMultiplier from shared faction canon.
check(
  /import\s*{\s*[^}]*\bgetFactionXpMultiplier\b[^}]*}\s*from\s*['"]\.\/shared\/faction-canon\.js['"]/m.test(worker),
  'worker.js: imports getFactionXpMultiplier from shared faction-canon.js',
);

// factionMeta must delegate xp_multiplier to getFactionXpMultiplier.
check(
  /xp_multiplier\s*:\s*getFactionXpMultiplier\s*\(/.test(worker),
  'worker.js: factionMeta uses getFactionXpMultiplier() for xp_multiplier',
);

// Shared canon must still be the owner of FACTION_XP_MULTIPLIERS.
check(
  factionCanon.includes('FACTION_XP_MULTIPLIERS'),
  'shared faction-canon.js: still owns FACTION_XP_MULTIPLIERS',
);

check(
  factionCanon.includes('getFactionXpMultiplier'),
  'shared faction-canon.js: still exports getFactionXpMultiplier',
);

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n────────────────────────────────────────────────────────────────────────');
console.log(`faction-season-lock.test.mjs: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

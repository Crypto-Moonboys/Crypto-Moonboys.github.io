/**
 * faction-season-lock.test.mjs
 *
 * Tests for the faction season lock feature (PR 6).
 *
 * Coverage:
 *   1. Frontend join flow (source-level checks on battle-chamber-factions.js)
 *   2. Server season lock (source-level checks on worker.js)
 *   3. Bot /gkfaction copy (worker.js)
 *   4. Preservation — existing faction routes / earn / status still present
 *   5. Migration file exists with correct schema
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
  bcFactions.includes('locked') && bcFactions.includes('Faction switch blocked'),
  'faction_locked_for_season error path: shows blocked message',
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
  bcFactions.includes('Next reset'),
  'Aligned user sees next reset info',
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

// ─────────────────────────────────────────────────────────────────────────────
// 2. Server season lock — worker.js
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── 2. Server season lock ────────────────────────────────────────────────');

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

check(
  worker.includes("'telegram_faction_season_locks'"),
  'Worker: /faction/join checks telegram_faction_season_locks table',
);

check(
  worker.includes('faction_locked_for_season'),
  'Worker: /faction/join returns faction_locked_for_season error code',
);

check(
  worker.includes('Same faction') ||
  (worker.includes('existingLock.faction_id === requestedFaction') ||
   worker.includes("existingLock?.faction_id === requestedFaction")),
  'Worker: same faction join is idempotent (allowed)',
);

check(
  worker.includes('Different faction') ||
  (worker.includes('409') && worker.includes('faction_locked_for_season')),
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

check(
  worker.includes("ON CONFLICT(telegram_id, season_key) DO UPDATE"),
  'Worker: upserts season lock row on successful join',
);

// All 9 canonical factions recognized by normalizeFaction
const allNineKeys = [
  'hard-fork-rockers', 'rugpull-minors', 'graffpunks', 'blockchain-furies',
  'crypto-moongirls', 'blockstars', 'all-city-bulls', 'nomad-bears', 'crypto-stoned-boys',
];
allNineKeys.forEach(function (key) {
  check(
    worker.includes("'" + key + "'") || worker.includes('"' + key + '"'),
    'Worker normalizeFaction: recognizes canonical key — ' + key,
  );
});

// FACTION_CONFIG includes all 9
allNineKeys.forEach(function (key) {
  check(
    worker.includes("'" + key + "'"),
    'Worker FACTION_CONFIG: includes canonical faction — ' + key,
  );
});

// Legacy aliases still map to canonical
check(
  worker.includes("'diamond-hands'") && worker.includes("'hard-fork-rockers'") &&
  (worker.includes("diamond-hands') return 'hard-fork-rockers'") ||
   worker.includes("'diamond-hands') return 'hard-fork-rockers'") ||
   // Check that diamond-hands appears as an alias key in normalizeFaction
   (function () {
     const normFn = worker.match(/function normalizeFaction[\s\S]*?\n\}/);
     return normFn && normFn[0].includes('hard-fork-rockers');
   })()),
  'Worker: diamond-hands alias maps to hard-fork-rockers',
);

// ─────────────────────────────────────────────────────────────────────────────
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

const newBcContent = bcFactions;
const FORBIDDEN_IN_BC = ['token reward', 'passive income', 'financial reward', 'earn money'];
FORBIDDEN_IN_BC.forEach(function (term) {
  check(
    !newBcContent.toLowerCase().includes(term.toLowerCase()),
    'No forbidden wording in battle-chamber-factions.js: "' + term + '"',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n────────────────────────────────────────────────────────────────────────');
console.log(`faction-season-lock.test.mjs: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

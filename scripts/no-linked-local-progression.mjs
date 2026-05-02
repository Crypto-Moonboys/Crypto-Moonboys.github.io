/**
 * no-linked-local-progression.mjs
 *
 * Anti-drift validation: detect progression files that write to localStorage
 * for linked users without a corresponding server sync path.
 *
 * A file FAILS if it contains localStorage.setItem() (in a progression-relevant
 * context) AND does NOT have at least one of:
 *   1. A fetch() call (server sync)
 *   2. An explicit guest-only guard comment: // guest-only or // unlinked-only
 *   3. A known-safe allowlist entry
 *
 * This script is intentionally conservative: it reports warnings for ambiguous
 * cases and only hard-fails on clear violations.
 *
 * Run: node scripts/no-linked-local-progression.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
let failures = 0;
let warnings = 0;

function fail(msg) { console.error(`  [FAIL] ${msg}`); failures++; }
function warn(msg) { console.warn(`  [WARN] ${msg}`); warnings++; }
function pass(msg) { console.log(`  [PASS] ${msg}`); }

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

/**
 * Files to check: progression systems that should never write only to
 * localStorage for linked users.
 */
const PROGRESSION_FILES = [
  'js/arcade/systems/cross-game-modifier-system.js',
  'js/arcade/systems/faction-missions.js',
  'js/arcade/systems/faction-war-system.js',
  'js/arcade/systems/faction-streaks.js',
  'js/battle-layer.js',
  'js/arcade-leaderboard.js',
];

/**
 * Game bootstrap files that record mission/faction/mastery progress.
 * These are allowed to write to localStorage as long as they also have
 * a server sync path (or are guest-only writes).
 */
const GAME_BOOTSTRAP_FILES = [
  'js/arcade/games/invaders/bootstrap.js',
  'js/arcade/games/asteroid-fork/bootstrap.js',
  'js/arcade/games/snake-run/bootstrap.js',
  'js/arcade/games/block-topia-quest-maze/bootstrap.js',
  'js/arcade/games/breakout-bullrun/bootstrap.js',
  'js/arcade/games/tetris/bootstrap.js',
  'js/arcade/games/pac-chain/bootstrap.js',
];

/**
 * Keys that are explicitly allowed as local-only (preferences, identity, cache).
 * Writes to these keys do NOT indicate a progression drift.
 */
const ALLOWED_LOCAL_ONLY_KEYS = new Set([
  'moonboys_presence_hidden',
  'moonboys_season_banner_dismissed',
  'moonboys_tg_id',
  'moonboys_tg_name',
  'moonboys_tg_linked',
  'moonboys_tg_auth',
  'MOONBOYS_TELEGRAM_AUTH',
  'moonboys_tg_sync_health',
  'moonboys_state_v1',
  'asteroidForkQa',
]);

function checkFile(relPath, isBootstrap = false) {
  const content = read(relPath);
  if (content === null) {
    warn(`${relPath}: file not found (skipped)`);
    return;
  }

  const hasSetItem = content.includes('localStorage.setItem');
  const hasFetch = content.includes('fetch(');
  const hasGuestGuard = /\/\/\s*(guest[-_]only|unlinked[-_]only|guest\s+only|unlinked\s+only)/i.test(content);
  const hasSyncServer = content.includes('/player/') || content.includes('/faction/signal') || content.includes('_syncContributionToServer') || content.includes('_syncMissionProgressToServer') || content.includes('_syncActiveModifierToServer');

  if (!hasSetItem) {
    pass(`${relPath}: no localStorage.setItem found`);
    return;
  }

  // Check if every setItem call is for a known-safe local-only key or has guest guard
  const setItemLines = content
    .split('\n')
    .map((line, i) => ({ line, lineNum: i + 1 }))
    .filter(({ line }) => line.includes('localStorage.setItem'));

  let hasUnsafeWrite = false;
  for (const { line, lineNum } of setItemLines) {
    // Check if this line uses a known-safe key as a string literal
    const isSafeKeyLiteral = Array.from(ALLOWED_LOCAL_ONLY_KEYS).some(k => line.includes(`'${k}'`) || line.includes(`"${k}"`));
    if (isSafeKeyLiteral) continue;

    // Check if this line uses a variable whose definition in the file matches a safe key
    // e.g.: const FOO = 'moonboys_presence_hidden'; ... localStorage.setItem(FOO, ...)
    const keyArgMatch = line.match(/localStorage\.setItem\(\s*([A-Z_a-z][A-Z_a-z0-9]*)/);
    if (keyArgMatch) {
      const varName = keyArgMatch[1];
      const varDefPattern = new RegExp(`(?:var|const|let)\\s+${varName}\\s*=\\s*['"]([^'"]+)['"]`);
      const varDefMatch = content.match(varDefPattern);
      if (varDefMatch && ALLOWED_LOCAL_ONLY_KEYS.has(varDefMatch[1])) continue;
    }

    // Check if there's a guest/unlinked guard within 20 lines above
    const linesBefore = content.split('\n').slice(Math.max(0, lineNum - 20), lineNum).join('\n');
    const hasLocalGuard = /isLinked|isTelegramLinked|guest|unlinked/i.test(linesBefore);

    if (!hasLocalGuard) {
      hasUnsafeWrite = true;
      if (!hasFetch && !hasSyncServer) {
        warn(`${relPath}:${lineNum}: localStorage.setItem without server sync path or guest guard`);
      }
    }
  }

  if (hasUnsafeWrite && !hasFetch && !hasSyncServer && !hasGuestGuard && !isBootstrap) {
    fail(`${relPath}: has localStorage.setItem for progression without server sync path`);
  } else if (hasFetch || hasSyncServer) {
    pass(`${relPath}: localStorage writes have server sync path`);
  } else if (hasGuestGuard) {
    pass(`${relPath}: localStorage writes have guest-only guard`);
  } else if (isBootstrap) {
    pass(`${relPath}: bootstrap — localStorage writes allowed (game session state)`);
  } else {
    pass(`${relPath}: localStorage writes appear safe`);
  }
}

/**
 * Check that MOONBOYS_STATE has source/linked/syncedAt fields.
 */
function checkMoonyboysState() {
  console.log('\n[moonboys-state] Authority fields');
  const content = read('js/core/moonboys-state.js');
  if (!content) { fail('js/core/moonboys-state.js not found'); return; }

  if (content.includes('linked:') && content.includes('source:') && content.includes('syncedAt:')) {
    pass('moonboys-state.js: linked/source/syncedAt fields present');
  } else {
    fail('moonboys-state.js: missing linked/source/syncedAt authority fields');
  }

  if (content.includes("source: 'server'")) {
    pass("moonboys-state.js: sets source: 'server' after successful hydration");
  } else {
    fail("moonboys-state.js: does not set source: 'server' after hydration");
  }

  if (content.includes("source: 'guest'")) {
    pass("moonboys-state.js: sets source: 'guest' for unlinked users");
  } else {
    fail("moonboys-state.js: does not set source: 'guest' for unlinked users");
  }
}

/**
 * Check that worker.js has the required player state endpoints.
 */
function checkWorkerEndpoints() {
  console.log('\n[worker] Required player state endpoints');
  const content = read('workers/moonboys-api/worker.js');
  if (!content) { fail('workers/moonboys-api/worker.js not found'); return; }

  const endpoints = [
    ['/player/state', 'GET /player/state'],
    ['/player/modifiers/active', 'POST /player/modifiers/active'],
    ['/player/daily-missions/progress', 'POST /player/daily-missions/progress'],
    ['/faction/signal/contribute', 'POST /faction/signal/contribute'],
    ['/player/mastery/update', 'POST /player/mastery/update'],
    ['ensurePlayerStateTables', 'ensurePlayerStateTables helper'],
    ['player_modifier_state', 'player_modifier_state table reference'],
    ['player_daily_mission_state', 'player_daily_mission_state table reference'],
    ['player_faction_signal_state', 'player_faction_signal_state table reference'],
    ['player_streak_state', 'player_streak_state table reference'],
    ['player_game_mastery_state', 'player_game_mastery_state table reference'],
  ];

  for (const [needle, label] of endpoints) {
    if (content.includes(needle)) {
      pass(`worker.js: ${label}`);
    } else {
      fail(`worker.js: missing ${label}`);
    }
  }
}

/**
 * Check that migration 015 exists.
 */
function checkMigration() {
  console.log('\n[migration] Player state tables migration');
  const content = read('workers/moonboys-api/migrations/015_player_server_state.sql');
  if (!content) {
    fail('migrations/015_player_server_state.sql not found');
    return;
  }
  const tables = [
    'player_modifier_state',
    'player_daily_mission_state',
    'player_faction_signal_state',
    'player_streak_state',
    'player_game_mastery_state',
  ];
  for (const t of tables) {
    if (content.includes(t)) {
      pass(`015_player_server_state.sql: table ${t} defined`);
    } else {
      fail(`015_player_server_state.sql: missing table ${t}`);
    }
  }
}

/**
 * Check that server sync is present in each progression system.
 */
function checkSystemServerSync() {
  console.log('\n[systems] Server sync helpers present');
  const checks = [
    ['js/arcade/systems/cross-game-modifier-system.js', '_syncActiveModifierToServer', 'hydrateModifiersFromServer'],
    ['js/arcade/systems/faction-missions.js', '_syncMissionProgressToServer', 'hydrateMissionsFromServer'],
    ['js/arcade/systems/faction-war-system.js', '_syncContributionToServer', null],
    ['js/arcade/systems/faction-streaks.js', 'hydrateStreaksFromServer', null],
  ];
  for (const [file, syncFn, hydrateFn] of checks) {
    const content = read(file);
    if (!content) { warn(`${file}: not found (skipped)`); continue; }
    if (content.includes(syncFn)) {
      pass(`${file}: ${syncFn} present`);
    } else {
      fail(`${file}: missing ${syncFn}`);
    }
    if (hydrateFn) {
      if (content.includes(hydrateFn)) {
        pass(`${file}: ${hydrateFn} present`);
      } else {
        fail(`${file}: missing ${hydrateFn}`);
      }
    }
  }
}

/**
 * Check that audit doc exists.
 */
function checkAuditDoc() {
  console.log('\n[docs] Audit document');
  const content = read('docs/LOCAL_STORAGE_TO_SERVER_AUDIT.md');
  if (!content) {
    fail('docs/LOCAL_STORAGE_TO_SERVER_AUDIT.md not found');
    return;
  }
  if (content.length > 1000) {
    pass('docs/LOCAL_STORAGE_TO_SERVER_AUDIT.md: present and non-trivial');
  } else {
    warn('docs/LOCAL_STORAGE_TO_SERVER_AUDIT.md: exists but seems too short');
  }
}

// ── Run all checks ────────────────────────────────────────────────────────────

console.log('no-linked-local-progression.mjs\n');

console.log('[1] Progression system files');
for (const f of PROGRESSION_FILES) {
  checkFile(f, false);
}

console.log('\n[2] Game bootstrap files');
for (const f of GAME_BOOTSTRAP_FILES) {
  checkFile(f, true);
}

checkMoonyboysState();
checkWorkerEndpoints();
checkMigration();
checkSystemServerSync();
checkAuditDoc();

console.log('\n─────────────────────────────────────────');
console.log('no-linked-local-progression check complete.');
console.log(`  Failures : ${failures}`);
console.log(`  Warnings : ${warnings}`);
console.log('─────────────────────────────────────────');

if (failures > 0) process.exit(1);

/**
 * Hard protection tests for the shared arcade roguelite post-run loop.
 *
 * These checks intentionally use source-level assertions so CI fails if an
 * active arcade game stops using submitScore() or if submitScore() stops
 * feeding the shared ArcadeMeta/ArcadeSync/faction path after accepted runs.
 *
 * Additional checks added by the XP Loop audit (2026-05):
 *   - All 8 canonical games are present in ACTIVE_GAMES
 *   - No HexGL game IDs or bootstrap paths appear in active game files or manifest
 *   - Unlinked users are never incorrectly shown as XP synced
 *   - Sync-state labels: public score, pending, and XP sync are separated
 *   - ArcadeSync.normalizeGame maps all 8 canonical game-directory IDs
 *   - Pending XP queue key is defined only in arcade-sync and consumed through import
 *   - Post-run audit comment blocks are present in each bootstrap (documentation)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFile(path.join(ROOT, rel), 'utf8');

const ACTIVE_GAMES = [
  ['Snake Run', 'js/arcade/games/snake-run/bootstrap.js'],
  ['Invaders 3008', 'js/arcade/games/invaders/bootstrap.js'],
  ['Breakout Bullrun', 'js/arcade/games/breakout-bullrun/bootstrap.js'],
  ['Pac-Chain', 'js/arcade/games/pac-chain/bootstrap.js'],
  ['Tetris Block Topia', 'js/arcade/games/tetris/bootstrap.js'],
  ['Asteroid Fork', 'js/arcade/games/asteroid-fork/bootstrap.js'],
  ['Crystal Quest', 'js/arcade/games/crystal-quest/bootstrap.js'],
  ['Block Topia Quest Maze', 'js/arcade/games/block-topia-quest-maze/bootstrap.js'],
];

function assertContains(source, needle, message) {
  assert.ok(source.includes(needle), `${message}: expected to find ${needle}`);
}

function assertOrdered(source, needles, message) {
  let cursor = -1;
  for (const needle of needles) {
    const next = source.indexOf(needle, cursor + 1);
    assert.ok(next > cursor, `${message}: expected ${needle} after previous protected call`);
    cursor = next;
  }
}

for (const [name, relPath] of ACTIVE_GAMES) {
  const source = await read(relPath);
  assert.match(source, /from ['"]\/js\/leaderboard-client\.js['"]/, `${name} must import leaderboard-client.js`);
  assert.match(source, /\bsubmitScore\s*\(/, `${name} must call submitScore()`);
  assert.doesNotMatch(source, /\bArcadeMeta\.trackGameResult\s*\(/, `${name} must not bypass submitScore() with direct ArcadeMeta tracking`);
  assert.doesNotMatch(source, /\bqueuePendingProgress\s*\(/, `${name} must not bypass submitScore() with direct pending queue writes`);
}

const leaderboard = await read('js/leaderboard-client.js');
assertContains(leaderboard, 'export async function submitScore', 'submitScore export must remain present');
assertContains(leaderboard, 'ArcadeMeta.trackGameResult', 'submitScore() must call ArcadeMeta.trackGameResult()');
assertContains(leaderboard, 'ArcadeSync.queuePendingProgress', 'ArcadeSync.queuePendingProgress() must stay in score flow');
assertContains(leaderboard, 'ArcadeSync.syncPendingArcadeProgress', 'ArcadeSync.syncPendingArcadeProgress() must stay in linked user flow');
assertContains(leaderboard, 'callFactionEarn("score_accept", score)', 'faction earn must stay in accepted linked score flow');
assertOrdered(
  leaderboard,
  ['data && data.accepted === true', 'callFactionEarn("score_accept", score)', 'ArcadeMeta.trackGameResult', 'ArcadeSync.queuePendingProgress', 'ArcadeSync.syncPendingArcadeProgress'],
  'accepted linked score path must keep faction, meta, queue, and sync wiring',
);

const meta = await read('js/arcade-meta-system.js');
for (const windowName of ['daily', 'weekly', 'monthly', 'seasonal']) {
  assert.match(meta, new RegExp(`${windowName}: \\{ key:`), `ArcadeMeta must keep ${windowName} window state`);
  assert.match(meta, new RegExp(`state\\.${windowName}\\.points \\+= metaPoints`), `ArcadeMeta must increment ${windowName} points`);
}
for (const eventName of [
  'arcade-meta-roguelite-completed',
  'arcade-meta-rabbit-holes-spawned',
  'arcade-meta-loop-cycle-updated',
  'arcade-meta-tracked',
]) {
  assertContains(meta, eventName, `ArcadeMeta must dispatch ${eventName}`);
}
assertContains(meta, 'completeEngagementLoops(state, run, timestamp)', 'trackGameResult() must update rabbit holes and daily roguelite tasks');
assertContains(meta, 'updateStreakState(state, run)', 'trackGameResult() must update streaks');
assertContains(meta, 'updateCloutWindows(state, run, metaPoints', 'trackGameResult() must update clout');
assertContains(meta, 'refreshLoopCycleState(state, timestamp)', 'trackGameResult() must refresh shared loop/next-action state');
assertContains(meta, 'function sanitizeLoopCycle', 'ArcadeMeta must sanitize stored loop_cycle cache');
assertContains(meta, 'function sanitizeNextAction', 'ArcadeMeta must sanitize stored next_action cache');
assertContains(meta, "const branchPaths = ['easy', 'risk', 'faction', 'competitive', 'exploration', 'comeback']", 'normal branch rolls must keep the configured six branch paths');
assertContains(meta, 'roguelite: state.engagement', 'trackGameResult() must return roguelite state to callers');
assertContains(meta, 'next_action: state.engagement.next_action', 'trackGameResult() must return next-action state to callers/events');
for (const branch of ['easy', 'risk', 'faction', 'competitive', 'exploration', 'comeback']) {
  assert.match(meta, new RegExp(`${branch}: \\{[^}]*path: '${branch}'`), `Rabbit holes must expose ${branch} branch`);
}
for (const cloutKey of ['daily', 'weekly', 'monthly', 'seasonal', 'streak', 'faction', 'game_mastery']) {
  assertContains(meta, cloutKey, `ArcadeMeta must keep ${cloutKey} clout`);
}

const hub = await read('games/index.html');
const actionCardsCss = await read('css/action-page-cards.css');
assertContains(hub, 'id="roguelite-loop-board"', 'games/index.html must render roguelite-loop-board');
assertContains(hub, 'class="arcade-hero swarmsy-hero"', 'games/index.html must use SWARMSY-style arcade hero');
assertContains(hub, 'class="swarmsy-title"', 'games/index.html must use SWARMSY title typography');
assertContains(hub, '&#10022; MOONBOYS ARCADE / XP SYSTEM', 'games hero kicker must render the SWARMSY sparkle marker via a safe entity');
assert.doesNotMatch(hub, /âœ¦|Ã¢Å“Â¦/, 'games hero kicker must not contain mojibake sparkle text');
assertContains(hub, "if (!Number.isFinite(timestamp) || timestamp <= 0) return 'pending';", 'formatReset() must guard invalid reset timestamps');
assertContains(hub, 'protected browser-driven roguelite post-run loop', 'games/index.html must state frontend-driven shared loop truth');
assert.doesNotMatch(hub, /CRYPTO%20MOONBOYS%20ARCADE%20GAME\.jpg/i, 'games/index.html must not render the old full-width arcade JPEG');
assert.doesNotMatch(hub, /CRYPTO%20MOONBOYS%20Roguelite%20Infinite%20Loop%20ARCADE%20GAME\.jpg/i, 'games/index.html must not render the full-width roguelite JPEG');
for (const label of ['Active daily cycle', 'Weekly faction target', 'Monthly clout target', 'Seasonal preview target', 'Next best action']) {
  assertContains(hub, label, `roguelite-loop-board must show ${label}`);
}

// ── No HexGL references in active game files or manifest ──────────────────────

assert.match(
  actionCardsCss,
  /body\.page-game \.roguelite-loop-panel\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?overflow:\s*hidden;/,
  'roguelite loop panel must override generic notice columns and contain its image/copy layout',
);
assert.match(
  actionCardsCss,
  /body\.page-game \.arcade-hero\s*\{[\s\S]*?min-height:\s*clamp\(520px,\s*58vh,\s*720px\);[\s\S]*?border-radius:\s*0;/,
  'games hero must use the full-width SWARMSY route treatment',
);
assert.match(
  actionCardsCss,
  /body\.page-game \.roguelite-loop-copy\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/,
  'roguelite loop copy must wrap inside the panel',
);

const manifest = await read('js/arcade/arcade-manifest.js');
assert.doesNotMatch(manifest, /hexgl/i, 'arcade-manifest.js must not reference HexGL');

for (const [name, relPath] of ACTIVE_GAMES) {
  const source = await read(relPath);
  assert.doesNotMatch(source, /hexgl/i, `${name} bootstrap must not reference HexGL`);
}

// ── Canonical game IDs: all 8 game-directory names must map via normalizeGame ─

const arcadeSync = await read('js/arcade-sync.js');
for (const alias of [
  'invaders-3008',
  'pac-chain',
  'asteroid-fork',
  'breakout-bullrun',
  'tetris-block-topia',
  'crystal-quest',
  'block-topia-quest-maze',
  'snake-run',
]) {
  assertContains(arcadeSync, `"${alias}"`, `ArcadeSync.normalizeGame must map canonical game ID: ${alias}`);
}

// ── Pending queue key must remain centralized in arcade-sync.js ───────────────

assertContains(arcadeSync, 'moonboys_arcade_pending_progress_v1', 'arcade-sync.js must define the pending queue key');
assert.match(
  leaderboard,
  /import\s+\{\s*ArcadeSync\s*\}\s+from\s+['"]\/js\/arcade-sync\.js['"]/,
  'leaderboard-client.js must import ArcadeSync from arcade-sync.js instead of duplicating queue configuration',
);
assert.doesNotMatch(
  leaderboard,
  /moonboys_arcade_pending_progress_v1/,
  'leaderboard-client.js must not duplicate the pending queue key literal; use ArcadeSync.PENDING_KEY',
);

// ── Unlinked users must never have XP falsely claimed as synced ───────────────
//
// The leaderboard-client must not emit a state of "xp_synced" or "xp_confirmed"
// for unlinked users, and the "login_required" state must stop unlinked writes
// before any local leaderboard/progression queue save.

assertContains(leaderboard, '"login_required"', 'leaderboard-client.js must use login_required state for unlinked users');
assert.doesNotMatch(leaderboard, /"local_cached_only"/, 'leaderboard-client.js must not save unlinked scores as local-only leaderboard state');
assert.doesNotMatch(leaderboard, /xp_synced|xp_confirmed/, 'leaderboard-client.js must not use a false "xp_synced" or "xp_confirmed" state label');

// ── Sync-state separation: public score submit vs competitive XP sync ─────────
//
// These three distinct states must all be present so callers can distinguish
// between a public-only score post and a server-confirmed competitive XP sync.

for (const stateLabel of [
  '"auth_required"',
  '"score_accepted"',
]) {
  assertContains(leaderboard, stateLabel, `leaderboard-client.js must expose separate sync state: ${stateLabel}`);
}

// ── API unavailable must queue/pend, not claim sync ───────────────────────────

assert.match(
  leaderboard,
  /if \(!api\) \{[\s\S]*?result\.state = "sync_pending";/,
  'missing leaderboard API branch must choose sync_pending for signed linked users',
);
assertOrdered(
  leaderboard,
  ['if (!api)', 'result.state = "sync_pending";', 'const shouldQueuePending', 'ArcadeSync.queuePendingProgress'],
  'API-unavailable branch must fall through without claiming sync',
);
assertContains(leaderboard, '"sync_pending"', 'leaderboard-client.js must use sync_pending state when API unavailable for linked users');

// ── Signed auth required before XP sync claim ────────────────────────────────

assertContains(leaderboard, 'hasSignedAuth', 'leaderboard-client.js must guard XP sync paths with hasSignedAuth');
assertContains(leaderboard, 'shouldSyncMeta = linked && hasSignedAuth', 'meta sync must only run when linked AND signed auth is present');

// ── Post-run audit comment blocks present in each bootstrap ──────────────────

for (const [name, relPath] of ACTIVE_GAMES) {
  const source = await read(relPath);
  assertContains(source, 'POST-RUN LOOP AUDIT', `${name} bootstrap must include post-run loop audit comment block`);
  assertContains(source, 'Arcade XP queue:', `${name} bootstrap audit block must document Arcade XP queue path`);
  assertContains(source, 'Unlinked users:', `${name} bootstrap audit block must document unlinked user behavior`);
  assertContains(source, 'Retry queue:', `${name} bootstrap audit block must document retry queue`);
}

console.log('Arcade roguelite protection checks passed.');

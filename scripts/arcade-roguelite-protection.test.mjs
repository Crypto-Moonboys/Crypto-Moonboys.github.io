/**
 * Hard protection tests for the shared arcade roguelite post-run loop.
 *
 * These checks intentionally use source-level assertions so CI fails if an
 * active arcade game stops using submitScore() or if submitScore() stops
 * feeding the shared ArcadeMeta/ArcadeSync/faction path after accepted runs.
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
assertContains(meta, 'roguelite: state.engagement', 'trackGameResult() must return roguelite state to callers');
assertContains(meta, 'next_action: state.engagement.next_action', 'trackGameResult() must return next-action state to callers/events');
for (const branch of ['easy', 'risk', 'faction', 'competitive', 'exploration', 'comeback']) {
  assert.match(meta, new RegExp(`${branch}: \\{[^}]*path: '${branch}'`), `Rabbit holes must expose ${branch} branch`);
}
for (const cloutKey of ['daily', 'weekly', 'monthly', 'seasonal', 'streak', 'faction', 'game_mastery']) {
  assertContains(meta, cloutKey, `ArcadeMeta must keep ${cloutKey} clout`);
}

const hub = await read('games/index.html');
assertContains(hub, 'id="roguelite-loop-board"', 'games/index.html must render roguelite-loop-board');
assertContains(hub, 'protected browser-driven roguelite post-run loop', 'games/index.html must state frontend-driven shared loop truth');
for (const label of ['Active daily cycle', 'Weekly faction target', 'Monthly clout target', 'Seasonal preview target', 'Next best action']) {
  assertContains(hub, label, `roguelite-loop-board must show ${label}`);
}

console.log('Arcade roguelite protection checks passed.');

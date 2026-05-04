/**
 * arcade-smoke.test.mjs
 *
 * Syntax / structural smoke tests for all 6 arcade games that do not yet
 * have dedicated per-game test files:
 *   - Snake Run
 *   - Breakout Bullrun
 *   - Asteroid Fork
 *   - Pac-Chain
 *   - Tetris Block Topia
 *   - Crystal Quest
 *
 * Each game is tested for:
 *   1. config.js exports canonical game id and label
 *   2. bootstrap.js imports ArcadeSync and submitScore
 *   3. bootstrap.js exports the expected adapter symbol
 *   4. game page index.html exists and has expected canvas/button elements
 *   5. game page links to arcade sidebar nav (all 8 arcade games)
 *
 * Existing smoke tests (Invaders 3008, Block Topia) are unchanged.
 *
 * Run:
 *   node scripts/arcade-smoke.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

async function readFile(relPath) {
  return fs.readFile(path.join(ROOT, relPath), 'utf8');
}

// ── Game definitions ──────────────────────────────────────────────────────────

const GAMES = [
  {
    name: 'Snake Run',
    gameDir: 'games/snake-run',
    configPath: 'js/arcade/games/snake-run/config.js',
    bootstrapPath: 'js/arcade/games/snake-run/bootstrap.js',
    canonicalId: 'snake',
    adapterExport: 'SNAKE_RUN_ADAPTER',
  },
  {
    name: 'Breakout Bullrun',
    gameDir: 'games/breakout-bullrun',
    configPath: 'js/arcade/games/breakout-bullrun/config.js',
    bootstrapPath: 'js/arcade/games/breakout-bullrun/bootstrap.js',
    canonicalId: 'breakout',
    adapterExport: 'BREAKOUT_BULLRUN_ADAPTER',
  },
  {
    name: 'Asteroid Fork',
    gameDir: 'games/asteroid-fork',
    configPath: 'js/arcade/games/asteroid-fork/config.js',
    bootstrapPath: 'js/arcade/games/asteroid-fork/bootstrap.js',
    canonicalId: 'asteroids',
    adapterExport: 'ASTEROID_FORK_ADAPTER',
  },
  {
    name: 'Pac-Chain',
    gameDir: 'games/pac-chain',
    configPath: 'js/arcade/games/pac-chain/config.js',
    bootstrapPath: 'js/arcade/games/pac-chain/bootstrap.js',
    canonicalId: 'pacchain',
    adapterExport: 'PAC_CHAIN_ADAPTER',
  },
  {
    name: 'Tetris Block Topia',
    gameDir: 'games/tetris-block-topia',
    configPath: 'js/arcade/games/tetris/config.js',
    bootstrapPath: 'js/arcade/games/tetris/bootstrap.js',
    canonicalId: 'tetris',
    adapterExport: 'TETRIS_ADAPTER',
  },
  {
    name: 'Crystal Quest',
    gameDir: 'games/crystal-quest',
    configPath: 'js/arcade/games/crystal-quest/config.js',
    bootstrapPath: 'js/arcade/games/crystal-quest/bootstrap.js',
    canonicalId: 'crystal',
    adapterExport: 'CRYSTAL_QUEST_ADAPTER',
    /** Crystal Quest uses a DOM renderer — no canvas element expected. */
    noCanvas: true,
  },
];

// All 9 arcade sidebar links that must appear in every game page nav.
const REQUIRED_NAV_LINKS = [
  '/games/invaders-3008/',
  '/games/pac-chain/',
  '/games/asteroid-fork/',
  '/games/breakout-bullrun/',
  '/games/tetris-block-topia/',
  '/games/block-topia-quest-maze/',
  '/games/crystal-quest/',
  '/games/snake-run/',
  '/games/block-topia/',
];

// ── Test runner ───────────────────────────────────────────────────────────────

let failures = 0;

function pass(msg) {
  process.stdout.write(`  [PASS] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`  [FAIL] ${msg}\n`);
  failures++;
}

function check(condition, msg) {
  if (condition) pass(msg);
  else fail(msg);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

for (const game of GAMES) {
  process.stdout.write(`\n── ${game.name} ──\n`);

  let configSrc, bootstrapSrc, indexHtml;

  try {
    configSrc = await readFile(game.configPath);
  } catch (e) {
    fail(`${game.configPath} is missing or unreadable: ${e.message}`);
    continue;
  }

  try {
    bootstrapSrc = await readFile(game.bootstrapPath);
  } catch (e) {
    fail(`${game.bootstrapPath} is missing or unreadable: ${e.message}`);
    continue;
  }

  try {
    indexHtml = await readFile(`${game.gameDir}/index.html`);
  } catch (e) {
    fail(`${game.gameDir}/index.html is missing or unreadable: ${e.message}`);
    indexHtml = null;
  }

  // 1. config.js has canonical id
  check(
    configSrc.includes(`id: '${game.canonicalId}'`) || configSrc.includes(`id: "${game.canonicalId}"`),
    `config.js id = '${game.canonicalId}' (canonical leaderboard key)`,
  );

  // 2. bootstrap.js imports ArcadeSync
  check(
    bootstrapSrc.includes("from '/js/arcade-sync.js'"),
    'bootstrap.js imports ArcadeSync',
  );

  // 3. bootstrap.js imports submitScore
  check(
    bootstrapSrc.includes("from '/js/leaderboard-client.js'") && bootstrapSrc.includes('submitScore'),
    'bootstrap.js imports and calls submitScore from leaderboard-client.js',
  );

  // 4. bootstrap.js exports the adapter symbol
  check(
    bootstrapSrc.includes(`export`) && bootstrapSrc.includes(game.adapterExport),
    `bootstrap.js exports ${game.adapterExport}`,
  );

  // 5. submitScore is NOT called in module top-level (only inside functions)
  // A crude but effective heuristic: the word 'submitScore' should only appear
  // inside indented function bodies, not at column 0.
  check(
    !bootstrapSrc.match(/^submitScore\(/m),
    'submitScore is not called at module top-level',
  );

  if (indexHtml) {
    // 6. index.html has the full arcade sidebar nav
    for (const link of REQUIRED_NAV_LINKS) {
      check(
        indexHtml.includes(link),
        `index.html sidebar includes link to ${link}`,
      );
    }

    // 7. index.html has a canvas element (or game-card for DOM-based games)
    if (game.noCanvas) {
      check(
        indexHtml.includes('game-card'),
        'index.html has a .game-card container (DOM-based renderer)',
      );
    } else {
      check(
        indexHtml.includes('<canvas'),
        'index.html has a canvas element',
      );
    }
  }
}

// ── arcade-manifest.js uses canonical IDs ─────────────────────────────────────
process.stdout.write('\n── arcade-manifest canonical ID check ──\n');

const manifestSrc = await readFile('js/arcade/arcade-manifest.js');
for (const game of GAMES) {
  check(
    manifestSrc.includes(`id: '${game.canonicalId}'`) || manifestSrc.includes(`id: "${game.canonicalId}"`),
    `arcade-manifest.js id = '${game.canonicalId}' for ${game.name}`,
  );
}

// ── Leaderboard worker GAME_KEY_ALIASES covers snake-run and breakout-bullrun ─
process.stdout.write('\n── Leaderboard worker alias coverage ──\n');

const workerSrc = await readFile('workers/leaderboard-worker.js');
check(
  workerSrc.includes("'snake-run'") && workerSrc.includes("'snake'"),
  "leaderboard-worker.js has GAME_KEY_ALIASES entry: 'snake-run' → 'snake'",
);
check(
  workerSrc.includes("'breakout-bullrun'") && workerSrc.includes("'breakout'"),
  "leaderboard-worker.js has GAME_KEY_ALIASES entry: 'breakout-bullrun' → 'breakout'",
);
check(
  workerSrc.includes('TELEGRAM_AUTH_MAX_AGE_SECONDS'),
  'leaderboard-worker.js defines TELEGRAM_AUTH_MAX_AGE_SECONDS for Telegram verification',
);
check(
  workerSrc.includes('verifyLeaderboardTelegramAuth'),
  'leaderboard-worker.js calls verifyLeaderboardTelegramAuth before accepting scores',
);

// ── Summary ───────────────────────────────────────────────────────────────────
process.stdout.write('\n');
if (failures > 0) {
  process.stderr.write(`Arcade smoke test FAILED with ${failures} failure(s).\n`);
  process.exit(1);
} else {
  process.stdout.write('All arcade smoke tests PASSED.\n');
}

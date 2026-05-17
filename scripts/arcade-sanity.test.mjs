/**
 * arcade-sanity.test.mjs
 *
 * Syntax / structural sanity checks for all 6 arcade games that do not yet
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
 *   6. fullscreen-only launch flag exists on every listed arcade game start button
 *   7. fullscreen overlay exit routing targets /games/
 *
 * Existing sanity checks (Invaders 3008, Block Topia) are unchanged.
 *
 * Run:
 *   node scripts/arcade-sanity.test.mjs
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
// Block Topia has a separate shell/runtime and is intentionally excluded.
const EXCLUDED_FROM_FULLSCREEN_ONLY = ['/games/block-topia/'];

const FULLSCREEN_ONLY_GAME_PAGES = REQUIRED_NAV_LINKS
  .filter((link) => !EXCLUDED_FROM_FULLSCREEN_ONLY.includes(link))
  .map((link) => `games/${link.replace(/^\/games\//, '').replace(/\/$/, '')}/index.html`);

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

// ── Fullscreen-only launch + exit routing invariants ──────────────────────────
process.stdout.write('\n── Fullscreen-only launch + exit routing ──\n');

for (const relPath of FULLSCREEN_ONLY_GAME_PAGES) {
  const html = await readFile(relPath);
  check(
    /id=["']startBtn["'][^>]*data-overlay-fullscreen-only=["']true["']|data-overlay-fullscreen-only=["']true["'][^>]*id=["']startBtn["']/u.test(html),
    `${relPath} sets #startBtn data-overlay-fullscreen-only="true"`,
  );
}
const btqmIndexHtml = await readFile('games/block-topia-quest-maze/index.html');
check(
  /id=["']btqm-canvas-wrap["'][^>]*class=["'][^"']*\bbtqm-game-area\b[^"']*["']|class=["'][^"']*\bbtqm-game-area\b[^"']*["'][^>]*id=["']btqm-canvas-wrap["']/u.test(btqmIndexHtml),
  'BTQM index keeps #btqm-canvas-wrap marked as .btqm-game-area for fullscreen stage targeting',
);

const fullscreenShellSrc = await readFile('js/game-fullscreen.js');
const fullscreenCssSrc = await readFile('css/game-fullscreen.css');
check(
  /overlayFullscreenOnly\s*===\s*['"]true['"]/u.test(fullscreenShellSrc),
  'game-fullscreen.js recognizes data-overlay-fullscreen-only flag',
);
check(
  /window\.location\.assign\(getOverlayExitHref\(\)\)/u.test(fullscreenShellSrc),
  'game-fullscreen.js exits fullscreen flow by routing through overlay exit href',
);
check(
  /function\s+sanitizeOverlayExitHref\(href\)\s*\{[\s\S]*return\s+['"]\/games\/['"][\s\S]*value\.charAt\(0\)\s*!==\s*['"]\/['"][\s\S]*value\.slice\(0,\s*2\)\s*===\s*['"]\/\/['"][\s\S]*\}/u.test(fullscreenShellSrc),
  'game-fullscreen.js sanitizes invalid overlay exit hrefs back to /games/',
);
check(
  /function\s+getOverlayExitHref\(\)\s*\{\s*return\s+sanitizeOverlayExitHref\(overlayExitHref\);\s*\}/u.test(fullscreenShellSrc),
  'game-fullscreen.js routes overlay exit href through sanitizeOverlayExitHref',
);
check(
  /function\s+sanitizeOverlayExitHref\(href\)\s*\{[\s\S]*return\s+['"]\/games\/['"]/u.test(fullscreenShellSrc),
  'game-fullscreen.js keeps /games/ as the default overlay exit fallback',
);
check(
  /overlay-panel-status/u.test(fullscreenShellSrc) &&
    /setAttribute\('role',\s*'status'\)/u.test(fullscreenShellSrc) &&
    /setAttribute\('aria-live',\s*'polite'\)/u.test(fullscreenShellSrc) &&
    /setAttribute\('aria-atomic',\s*'true'\)/u.test(fullscreenShellSrc),
  'game-fullscreen.js keeps collapsed panel status announcements accessible (role/status + polite live region)',
);
check(
  /overlay-btn-info/u.test(fullscreenShellSrc) &&
    /overlay-btn-data/u.test(fullscreenShellSrc) &&
    /overlay-side-open-left/u.test(fullscreenShellSrc) &&
    /overlay-side-open-right/u.test(fullscreenShellSrc),
  'game-fullscreen.js provides collapsible overlay panel toggles so side panels do not permanently squeeze gameplay',
);
check(
  // closed → inert + aria-hidden="true"
  /sideLeft\.setAttribute\('inert',\s*''\)/u.test(fullscreenShellSrc) &&
    /sideLeft\.setAttribute\('aria-hidden',\s*'true'\)/u.test(fullscreenShellSrc) &&
    /sideLeft\.removeAttribute\('inert'\)/u.test(fullscreenShellSrc) &&
    /sideLeft\.setAttribute\('aria-hidden',\s*'false'\)/u.test(fullscreenShellSrc),
  'game-fullscreen.js makes closed left drawer inert and aria-hidden to block keyboard/AT access',
);
check(
  /sideRight\.setAttribute\('inert',\s*''\)/u.test(fullscreenShellSrc) &&
    /sideRight\.setAttribute\('aria-hidden',\s*'true'\)/u.test(fullscreenShellSrc) &&
    /sideRight\.removeAttribute\('inert'\)/u.test(fullscreenShellSrc) &&
    /sideRight\.setAttribute\('aria-hidden',\s*'false'\)/u.test(fullscreenShellSrc),
  'game-fullscreen.js makes closed right drawer inert and aria-hidden to block keyboard/AT access',
);
check(
  // portrait mobile + landscape hidden-toggle breakpoints both trigger auto-close
  /MOBILE_BREAKPOINT_PX\s*=\s*480/u.test(fullscreenShellSrc) &&
    /HIDDEN_TOGGLE_MQ_LANDSCAPE/u.test(fullscreenShellSrc) &&
    /max-width:\s*900px.*max-height:\s*500px|max-height:\s*500px.*max-width:\s*900px/u.test(fullscreenShellSrc) &&
    /closeOverlayPanels\(\{\s*silent:\s*true\s*\}\)/u.test(fullscreenShellSrc) &&
    /attachMq\(/u.test(fullscreenShellSrc),
  'game-fullscreen.js force-closes drawers when viewport enters mobile breakpoint to avoid orphaned open drawer with hidden controls',
);
check(
  /#game-overlay\s+canvas:not\(#nextCanvas\)\s*\{[\s\S]*width:\s*min\(100%,\s*calc\(\(100dvh\s*-\s*var\(--overlay-toolbar-height\)\s*-\s*var\(--overlay-touch-height\)\s*-\s*var\(--overlay-stage-gap\)\)\s*\*\s*var\(--overlay-canvas-aspect,\s*4\s*\/\s*3\)\)\)\s*!important;/u.test(fullscreenCssSrc),
  'game-fullscreen.css fullscreen canvas rule uses viewport-height budget plus per-canvas aspect ratio variable',
);
check(
  /#game-overlay\s+canvas:not\(#nextCanvas\)\s*\{[\s\S]*max-height:\s*calc\(100dvh\s*-\s*var\(--overlay-toolbar-height\)\s*-\s*var\(--overlay-touch-height\)\s*-\s*var\(--overlay-stage-gap\)\)\s*!important;/u.test(fullscreenCssSrc),
  'game-fullscreen.css fullscreen canvas rule enforces max-height viewport budget',
);
check(
  /#game-overlay\s+\.overlay-side\s*\{[\s\S]*position:\s*absolute;/u.test(fullscreenCssSrc),
  'game-fullscreen.css keeps overlay-side positioned as drawer overlays',
);
check(
  /#game-overlay\s+\.overlay-side\s*\{[\s\S]*pointer-events:\s*none;/u.test(fullscreenCssSrc),
  'game-fullscreen.css keeps closed overlay drawers non-interactive by default',
);
check(
  /#game-overlay\.overlay-side-open-left\s+\.overlay-side--left/u.test(fullscreenCssSrc),
  'game-fullscreen.css provides left drawer open-state selector',
);
check(
  /#game-overlay\.overlay-side-open-right\s+\.overlay-side--right/u.test(fullscreenCssSrc),
  'game-fullscreen.css provides right drawer open-state selector',
);
check(
  /#game-overlay\s+\.overlay-side\s*\{[\s\S]*opacity:\s*0;[\s\S]*\}/u.test(fullscreenCssSrc),
  'game-fullscreen.css keeps closed drawers visually hidden until toggled open',
);
check(
  /#game-overlay\.overlay-side-open-left\s+\.overlay-side--left[\s\S]*pointer-events:\s*auto;/u.test(fullscreenCssSrc) &&
    /#game-overlay\.overlay-side-open-right\s+\.overlay-side--right[\s\S]*pointer-events:\s*auto;/u.test(fullscreenCssSrc),
  'game-fullscreen.css restores drawer interactivity only in open states',
);
check(
  /#game-overlay\s+\.overlay-side--left\s*\{[\s\S]*transform:\s*translateX\(calc\(-100%\s*-\s*10px\)\);/u.test(fullscreenCssSrc) &&
    /#game-overlay\s+\.overlay-side--right\s*\{[\s\S]*transform:\s*translateX\(calc\(100%\s*\+\s*10px\)\);/u.test(fullscreenCssSrc),
  'game-fullscreen.css defines off-canvas transforms for left and right drawers',
);
check(
  /#game-overlay\s+\.overlay-side\s*\{[\s\S]*backdrop-filter:\s*blur\(4px\);/u.test(fullscreenCssSrc),
  'game-fullscreen.css applies overlay drawer backdrop styling for readable panel content',
);
check(
  /#overlay-ctrl-bar\s+button\s*\{[\s\S]*min-height:\s*34px;[\s\S]*min-width:\s*40px;/u.test(fullscreenCssSrc),
  'game-fullscreen.css keeps fullscreen toolbar controls at touch-usable minimum sizes',
);
check(
  /@media\s*\(max-width:\s*480px\)[\s\S]*#overlay-btn-info\s+\.btn-label[\s\S]*#overlay-btn-data\s+\.btn-label[\s\S]*#overlay-btn-fs\s+\.btn-label[\s\S]*#overlay-btn-mute\s+\.btn-label[\s\S]*display:\s*none;/u.test(fullscreenCssSrc),
  'game-fullscreen.css keeps primary toolbar labels on small screens while hiding only secondary labels',
);
check(
  /@media\s*\(max-height:\s*500px\)\s*and\s*\(max-width:\s*900px\)[\s\S]*#game-overlay\s+\.overlay-side\s*\{[\s\S]*width:\s*min\((72|80)vw,\s*(260|240)px\);/u.test(fullscreenCssSrc),
  'game-fullscreen.css compacts drawer width in mobile landscape so playfield keeps priority',
);
check(
  /@media\s*\(max-width:\s*900px\)[\s\S]*#game-overlay\s+\.overlay-side\s+\.fs-card\s*\{[\s\S]*padding:\s*8px\s+8px\s+5px;/u.test(fullscreenCssSrc),
  'game-fullscreen.css compacts overlay cards on smaller viewports',
);
check(
  /window\.addEventListener\('resize',\s*function\s*\(\)\s*\{[\s\S]*scheduleOverlayResizeSync\('viewport-resize',\s*\{\s*skipWindowResize:\s*true\s*\}\);/u.test(fullscreenShellSrc) &&
    /window\.addEventListener\('orientationchange',\s*function\s*\(\)\s*\{[\s\S]*scheduleOverlayResizeSync\('orientationchange'\);/u.test(fullscreenShellSrc) &&
    /document\.dispatchEvent\(new CustomEvent\('arcade-overlay-resize'/u.test(fullscreenShellSrc),
  'game-fullscreen.js emits overlay resize lifecycle hooks for viewport resize/orientation changes',
);
const btqmBootstrapSrc = await readFile('js/arcade/games/block-topia-quest-maze/bootstrap.js');
check(
  /document\.addEventListener\('arcade-overlay-open',\s*onOverlayLifecycle\)/u.test(btqmBootstrapSrc) &&
    /document\.addEventListener\('arcade-overlay-close',\s*onOverlayLifecycle\)/u.test(btqmBootstrapSrc) &&
    /document\.addEventListener\('arcade-overlay-resize',\s*onOverlayLifecycle\)/u.test(btqmBootstrapSrc) &&
    /window\.addEventListener\('orientationchange',\s*onViewportChange\)/u.test(btqmBootstrapSrc),
  'BTQM bootstrap refreshes Phaser scale on overlay open/close/resize and orientation changes',
);

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

// ── Asteroid Fork resize/render dimension invariants ─────────────────────────
// Verifies that applyFullscreenFit updates state.worldW/worldH to match the
// logical canvas size and regenerates stars, so the background and wrap logic
// use the real current canvas dimensions after every resize or fullscreen change.
process.stdout.write('\n── Asteroid Fork resize/render dimension invariants ──\n');

const afBootstrapSrc = await readFile('js/arcade/games/asteroid-fork/bootstrap.js');

// Extract the applyFullscreenFit function body for targeted assertions so the
// checks are not sensitive to exact temp-variable names used in the implementation.
const fitFnStart = afBootstrapSrc.indexOf('function applyFullscreenFit');
const fitFnEnd   = afBootstrapSrc.indexOf('\nfunction ', fitFnStart + 1);
const fitFnBody  = fitFnStart >= 0
  ? afBootstrapSrc.slice(fitFnStart, fitFnEnd > 0 ? fitFnEnd : fitFnStart + 6000)
  : '';

check(
  fitFnBody.length > 0 &&
    /state\.worldW\s*=\s*\S/.test(fitFnBody) &&
    /state\.worldH\s*=\s*\S/.test(fitFnBody),
  'asteroid-fork applyFullscreenFit assigns state.worldW and state.worldH to canvas logical dimensions',
);
check(
  /state\.stars\s*=\s*\[\]/.test(fitFnBody) &&
    /state\.worldW/.test(fitFnBody) &&
    /state\.worldH/.test(fitFnBody),
  'asteroid-fork applyFullscreenFit regenerates starfield using current state.worldW/worldH bounds',
);
check(
  /state\.worldW[\s\S]{0,80}!==/.test(fitFnBody) ||
    /!==[\s\S]{0,80}state\.worldW/.test(fitFnBody),
  'asteroid-fork applyFullscreenFit guards world/star recalculation to changed dimensions only',
);

// ── Summary ───────────────────────────────────────────────────────────────────
process.stdout.write('\n');
if (failures > 0) {
  process.stderr.write(`Arcade sanity check FAILED with ${failures} failure(s).\n`);
  process.exit(1);
} else {
  process.stdout.write('All arcade sanity checks PASSED.\n');
}

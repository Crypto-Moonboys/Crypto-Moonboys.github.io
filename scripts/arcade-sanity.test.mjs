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
    /overlay-btn-modifiers/u.test(fullscreenShellSrc) &&
    /overlay-btn-faction/u.test(fullscreenShellSrc) &&
    /overlay-side-modifiers/u.test(fullscreenShellSrc) &&
    /overlay-side-faction/u.test(fullscreenShellSrc) &&
    /_activePanel/u.test(fullscreenShellSrc),
  'game-fullscreen.js provides dedicated collapsible overlay panel toggles so gameplay keeps priority',
);
check(
  /info:\s*\{\s*button:\s*btnInfo,\s*panel:\s*sideLeft/u.test(fullscreenShellSrc) &&
    /config\.panel\.setAttribute\('inert',\s*''\)/u.test(fullscreenShellSrc) &&
    /config\.panel\.setAttribute\('aria-hidden',\s*'true'\)/u.test(fullscreenShellSrc) &&
    /config\.panel\.removeAttribute\('inert'\)/u.test(fullscreenShellSrc) &&
    /config\.panel\.setAttribute\('aria-hidden',\s*'false'\)/u.test(fullscreenShellSrc),
  'game-fullscreen.js keeps the info drawer under config-driven inert and aria-hidden management',
);
check(
  /data:\s*\{\s*button:\s*btnData,\s*panel:\s*sideRight/u.test(fullscreenShellSrc),
  'game-fullscreen.js maps the data drawer into the shared overlay panel config',
);
check(
  /modifiers:\s*\{\s*button:\s*btnModifiers,\s*panel:\s*sideModifiers/u.test(fullscreenShellSrc),
  'game-fullscreen.js maps the modifiers drawer into the shared overlay panel config',
);
check(
  /faction:\s*\{\s*button:\s*btnFaction,\s*panel:\s*sideFaction/u.test(fullscreenShellSrc),
  'game-fullscreen.js maps the faction drawer into the shared overlay panel config',
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
  /#game-overlay\s+\.overlay-side\.is-open/u.test(fullscreenCssSrc),
  'game-fullscreen.css provides shared open-state selector for overlay drawers',
);
check(
  /#game-overlay\s+\.overlay-side\s*\{[\s\S]*opacity:\s*0;[\s\S]*\}/u.test(fullscreenCssSrc),
  'game-fullscreen.css keeps closed drawers visually hidden until toggled open',
);
check(
  /#game-overlay\s+\.overlay-side\.is-open[\s\S]*pointer-events:\s*auto;/u.test(fullscreenCssSrc),
  'game-fullscreen.css restores drawer interactivity only in open states',
);
check(
  /#game-overlay\s+\.overlay-side--left\s*\{[\s\S]*transform:\s*translateX\(calc\(-100%\s*-\s*10px\)\);/u.test(fullscreenCssSrc) &&
    /#game-overlay\s+\.overlay-side--right\s*\{[\s\S]*transform:\s*translateX\(calc\(100%\s*\+\s*10px\)\);/u.test(fullscreenCssSrc),
  'game-fullscreen.css defines off-canvas transforms for left and right drawers',
);
check(
  /#game-overlay\s+\.overlay-side\s*\{[\s\S]*backdrop-filter:\s*blur\((4|8)px\);/u.test(fullscreenCssSrc),
  'game-fullscreen.css applies overlay drawer backdrop styling for readable panel content',
);
check(
  (() => {
    const ctrlBtnRuleMatch = fullscreenCssSrc.match(/#overlay-ctrl-bar\s+button\s*\{([^}]*)\}/u);
    if (!ctrlBtnRuleMatch) return false;
    const ruleBody = ctrlBtnRuleMatch[1];
    return /(?:^|\n)\s*min-height:\s*34px;/u.test(ruleBody) &&
      /(?:^|\n)\s*min-width:\s*34px;/u.test(ruleBody) &&
      /(?:^|\n)\s*background:\s*rgba\(255,\s*255,\s*255,\s*0\.04\);/u.test(ruleBody) &&
      /(?:^|\n)\s*border-radius:\s*999px;/u.test(ruleBody);
  })(),
  'game-fullscreen.css keeps fullscreen toolbar controls at touch-usable minimum sizes',
);
check(
  /#overlay-ctrl-bar\s+\.btn-label\s*\{[\s\S]*display:\s*none\s*!important;/u.test(fullscreenCssSrc),
  'game-fullscreen.css keeps fullscreen toolbar controls icon-only by hiding text labels globally',
);
check(
  /@media\s*\(max-height:\s*500px\)\s*and\s*\(max-width:\s*900px\)[\s\S]*#game-overlay\s+\.overlay-side\s*\{[\s\S]*width:\s*min\((72|80|88)vw,\s*(260|240|280)px\);/u.test(fullscreenCssSrc),
  'game-fullscreen.css compacts drawer width in mobile landscape so playfield keeps priority',
);
check(
  /@media\s*\(max-width:\s*900px\)[\s\S]*#game-overlay\s+\.overlay-side\s+\.fs-card\s*\{[\s\S]*padding:\s*8px\s+8px\s+5px;/u.test(fullscreenCssSrc),
  'game-fullscreen.css compacts overlay cards on smaller viewports',
);
check(
  /@media\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*#game-overlay\.overlay-touch-landscape\s*\{[\s\S]*--overlay-touch-height:\s*0px;/u.test(fullscreenCssSrc) &&
    /@media\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*#game-overlay\.overlay-touch-landscape\s+\.overlay-touch-pad\s*\{[\s\S]*position:\s*absolute;[\s\S]*top:\s*var\(--overlay-toolbar-height\);[\s\S]*bottom:\s*0;[\s\S]*max-height:\s*none;/u.test(fullscreenCssSrc) &&
    /@media\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*#game-overlay\.overlay-touch-landscape\s+\.game-stage\s*\{[\s\S]*padding-left:[\s\S]*padding-right:/u.test(fullscreenCssSrc),
  'game-fullscreen.css uses coarse-pointer landscape split touch zones, clears inherited touch-pad max-height, and removes bottom touch-height reservation while expanding stage with side safe-zones',
);
check(
  (() => {
    // D-pad is 3×42px cols + 2×4px gaps = 134px; require zone clamp min ≥ 140px and explicit min-width ≥ 134px
    const zoneWidthMatch = fullscreenCssSrc.match(
      /@media\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*?--overlay-touch-zone-width:\s*clamp\((\d+)px/u,
    );
    const zoneMinWidthMatch = fullscreenCssSrc.match(
      /@media\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*?touch-gamepad-split[\s\S]*?\.touch-zone\s*\{[\s\S]*?min-width:\s*(\d+)px/u,
    );
    const clampMin = zoneWidthMatch ? parseInt(zoneWidthMatch[1], 10) : 0;
    const zoneMinWidth = zoneMinWidthMatch ? parseInt(zoneMinWidthMatch[1], 10) : 0;
    return clampMin >= 140 && zoneMinWidth >= 134;
  })(),
  'game-fullscreen.css landscape touch-zone clamp min ≥ 140px and explicit min-width ≥ 134px so the fixed 134px D-pad never overflows into the playfield',
);
check(
  (() => {
    // Canvas budget: on the narrowest common landscape phone (iPhone 5 / SE 1st gen = 568px wide),
    // canvas width = viewportWidth - 2×(8px stage-padding + zoneMin).
    // Require canvas ≥ 200px: zoneMin ≤ (568 - 200 - 16) / 2 = 176px.
    // Also require zone clamp max ≤ 200px so canvas stays ≥ 200px even at the wide end
    // on a 640px-wide phone (640 - 2×(8+200) = 224px).
    const zoneWidthMatch = fullscreenCssSrc.match(
      /@media\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*?--overlay-touch-zone-width:\s*clamp\((\d+)px,\s*[\d.]+vw,\s*(\d+)px\)/u,
    );
    const clampMin = zoneWidthMatch ? parseInt(zoneWidthMatch[1], 10) : 999;
    const clampMax = zoneWidthMatch ? parseInt(zoneWidthMatch[2], 10) : 999;
    const canvasBudgetAt568 = 568 - 2 * (8 + clampMin);
    return canvasBudgetAt568 >= 200 && clampMax <= 200;
  })(),
  'game-fullscreen.css landscape zone sizing leaves ≥ 200px canvas on a 568px-wide phone (clampMin ≤ 176px) and clampMax ≤ 200px so canvas is never crushed',
);
check(
  (() => {
    // Large coarse-pointer screens (iPad/tablet landscape) also match the split layout,
    // so a later landscape override must restore --overlay-touch-height:0px after the
    // min-width:1100 coarse-pointer rule sets 68px.
    const coarseLarge68Pos = fullscreenCssSrc.search(
      /@media\s*\(pointer:\s*coarse\)\s*and\s*\(min-width:\s*1100px\)[\s\S]*?#game-overlay\.overlay-has-touch\s*\{[\s\S]*?--overlay-touch-height:\s*68px/u,
    );
    const laterLandscapeZeroRelativePos = coarseLarge68Pos > -1
      ? fullscreenCssSrc.slice(coarseLarge68Pos + 1).search(
          /@media\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*?#game-overlay\.overlay-touch-landscape\s*\{[\s\S]*?--overlay-touch-height:\s*0px/u,
        )
      : -1;
    return coarseLarge68Pos > -1 && laterLandscapeZeroRelativePos > -1;
  })(),
  'game-fullscreen.css re-asserts landscape split --overlay-touch-height:0px after the large coarse-pointer 68px rule so side controls never reserve bottom canvas space',
);
check(
  (() => {
    // Source-order tiebreaker: the landscape-split max-height:none override must appear
    // AFTER the mobile-landscape max-height:52px rule so it wins the cascade when both
    // @media queries match on the same device (phones in landscape).
    const mobileMaxHeight52Pos = fullscreenCssSrc.search(
      /@media\s*\(max-height:\s*500px\)\s*and\s*\(max-width:\s*900px\)[\s\S]*?#game-overlay\.overlay-has-touch\s+\.overlay-touch-pad\s*\{[\s\S]*?max-height:\s*52px/u,
    );
    // Find the tiebreaker block: a second (pointer:coarse)+(landscape) block specifically
    // containing overlay-touch-landscape .overlay-touch-pad { max-height: none }
    // We search for it after the mobile-landscape block.
    const tiebreakPos = mobileMaxHeight52Pos > -1
      ? fullscreenCssSrc.indexOf('max-height: none', mobileMaxHeight52Pos + 1)
      : -1;
    return mobileMaxHeight52Pos > -1 && tiebreakPos > mobileMaxHeight52Pos;
  })(),
  'game-fullscreen.css landscape-split max-height:none tiebreaker appears after mobile-landscape max-height:52px so cascade override is guaranteed',
);
check(
  (() => {
    const touchGamepadRules = fullscreenCssSrc.match(/#game-overlay\s+\.touch-gamepad\s*\{/gu) || [];
    const touchZoneRules = fullscreenCssSrc.match(/#game-overlay\s+\.touch-zone\s*\{/gu) || [];
    return touchGamepadRules.length === 1 && touchZoneRules.length === 1;
  })(),
  'game-fullscreen.css keeps single consolidated base rules for .touch-gamepad and .touch-zone (no duplicate conflicting selectors)',
);
check(
  /@media\s*\(max-width:\s*480px\)[\s\S]*#game-overlay\.overlay-has-touch\s+\.overlay-touch-pad\s*\{[\s\S]*display:\s*flex;[\s\S]*\}/u.test(fullscreenCssSrc) &&
    /@media\s*\(max-width:\s*480px\)[\s\S]*#game-overlay\.overlay-has-touch\s*\{[\s\S]*--overlay-touch-height:\s*58px;/u.test(fullscreenCssSrc),
  'game-fullscreen.css preserves portrait bottom touch controls with explicit overlay touch-height budget',
);
check(
  // body.arcade-fullscreen-only:not(.overlay-open) #cm-modifier-panel — display:none
  /body\.arcade-fullscreen-only:not\(\.overlay-open\)[^{]*#cm-modifier-panel[\s\S]*?display:\s*none/u.test(fullscreenCssSrc),
  'game-fullscreen.css hides on-page modifier panel in arcade-fullscreen-only mode to prevent pre-overlay card flash',
);
check(
  // body.arcade-fullscreen-only:not(.overlay-open) #faction-hud — display:none
  /body\.arcade-fullscreen-only:not\(\.overlay-open\)[^{]*#faction-hud[\s\S]*?display:\s*none/u.test(fullscreenCssSrc),
  'game-fullscreen.css hides on-page faction HUD in arcade-fullscreen-only mode to prevent pre-overlay flash',
);
check(
  // body.overlay-open #faction-hud — display:none (overlay has its own faction card)
  /body\.overlay-open\s[^{]*#faction-hud[\s\S]*?display:\s*none/u.test(fullscreenCssSrc),
  'game-fullscreen.css hides page-level faction HUD while overlay is open (overlay faction card is used instead)',
);
check(
  /function\s+moveModifierPanelIntoOverlayDrawer\(\)\s*\{[\s\S]*getElementById\('cm-modifier-panel'\)[\s\S]*modifierPanelHost\.appendChild\(pageModPanel\)/u.test(fullscreenShellSrc) &&
    /if\s*\(!modPanelOrigParent\s*&&\s*pageModPanel\.parentNode\)/u.test(fullscreenShellSrc),
  'game-fullscreen.js defines reusable moveModifierPanelIntoOverlayDrawer() helper for the dedicated modifiers drawer and records original parent/sibling only once',
);
check(
  /new\s+MutationObserver\(/u.test(fullscreenShellSrc) &&
    /function\s+startModifierPanelObserver\(\)/u.test(fullscreenShellSrc) &&
    /modPanelObserver\.observe\(document\.body,\s*\{\s*childList:\s*true,\s*subtree:\s*true\s*\}\)/u.test(fullscreenShellSrc),
  'game-fullscreen.js includes async modifier mount handling via a MutationObserver while overlay is open',
);
check(
  /addEventListener\('arcade-overlay-open',\s*function\s*\(\)\s*\{[\s\S]*moveModifierPanelIntoOverlayDrawer\(\)/u.test(fullscreenShellSrc),
  'game-fullscreen.js reruns modifier docking after arcade-overlay-open to catch late-mounted panel state',
);
check(
  /function\s+stopModifierPanelObserver\(\)\s*\{[\s\S]*modPanelObserver\.disconnect\(\)/u.test(fullscreenShellSrc) &&
    /stopModifierPanelObserver\(\);/u.test(fullscreenShellSrc),
  'game-fullscreen.js disconnects the modifier panel observer during overlay close cleanup',
);
check(
  /modPanelOrigParent\.insertBefore\(cachedPageModPanel,\s*modPanelOrigNextSib\)/u.test(fullscreenShellSrc) &&
    /cachedPageModPanel\s*=\s*null;/u.test(fullscreenShellSrc) &&
    /modPanelOrigParent\s*=\s*null;/u.test(fullscreenShellSrc) &&
    /modPanelOrigNextSib\s*=\s*null;/u.test(fullscreenShellSrc),
  'game-fullscreen.js restores modifier panel to its original location on close and clears restore caches safely',
);
check(
  /window\.addEventListener\('resize',\s*function\s*\(\)\s*\{[\s\S]*scheduleOverlayResizeSync\('viewport-resize',\s*\{\s*skipWindowResize:\s*true\s*\}\);/u.test(fullscreenShellSrc) &&
    /window\.addEventListener\('orientationchange',\s*function\s*\(\)\s*\{[\s\S]*scheduleOverlayResizeSync\('orientationchange'\);/u.test(fullscreenShellSrc) &&
    /document\.dispatchEvent\(new CustomEvent\('arcade-overlay-resize'/u.test(fullscreenShellSrc),
  'game-fullscreen.js emits overlay resize lifecycle hooks for viewport resize/orientation changes',
);
check(
  /function\s+buildGamepadSplit\(\s*leftControls,\s*rightControls,\s*extraClass\s*\)\s*\{[\s\S]*touch-zone-left[\s\S]*touch-zone-right/u.test(fullscreenShellSrc) &&
    /function\s+syncTouchLayoutMode\(\)\s*\{[\s\S]*overlay\.classList\.toggle\('overlay-touch-landscape',\s*splitLandscape\);[\s\S]*touchPad\.classList\.toggle\('touch-gamepad-split',\s*splitLandscape\);/u.test(fullscreenShellSrc) &&
    /function\s+buildTouchPad\(\s*meta\s*\)\s*\{[\s\S]*syncTouchLayoutMode\(\);/u.test(fullscreenShellSrc),
  'game-fullscreen.js supports left/right touch-zone grouping and toggles landscape split classes from touch-mode state',
);
check(
  /function\s+buildDpad\(\)\s*\{[\s\S]*buildGamepadSplit\(/u.test(fullscreenShellSrc) &&
    /function\s+buildDpadBomb\(\)\s*\{[\s\S]*buildGamepadSplit\(/u.test(fullscreenShellSrc) &&
    /function\s+buildLrLaunch\(\)\s*\{[\s\S]*buildGamepadSplit\(/u.test(fullscreenShellSrc) &&
    /function\s+buildLrFire\(\)\s*\{[\s\S]*buildGamepadSplit\(/u.test(fullscreenShellSrc) &&
    /function\s+buildAsteroid\(\)\s*\{[\s\S]*buildGamepadSplit\(/u.test(fullscreenShellSrc) &&
    /function\s+buildTetris\(\)\s*\{[\s\S]*buildGamepadSplit\(/u.test(fullscreenShellSrc),
  'game-fullscreen.js touch builders map per-game controls through the shared left/right split-group helper',
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

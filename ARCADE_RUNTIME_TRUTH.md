# ARCADE RUNTIME TRUTH

**Version:** 2026-05-20
**Scope:** Single source of truth for all live Moonboys Arcade runtime paths.

Agents must read this file before editing any arcade code. There is exactly one
active path per dimension. Dead paths have been deleted — if something is not in
this document, it does not exist in the repo.

---

## Active Arcade Roster

Eight games. All entries are in `js/arcade/arcade-manifest.js`.

| Manifest ID | URL path | Bootstrap |
|---|---|---|
| `invaders` | `/games/invaders-3008/` | `js/arcade/games/invaders/bootstrap.js` |
| `pacchain` | `/games/pac-chain/` | `js/arcade/games/pac-chain/bootstrap.js` |
| `asteroids` | `/games/asteroid-fork/` | `js/arcade/games/asteroid-fork/bootstrap.js` |
| `breakout` | `/games/breakout-bullrun/` | `js/arcade/games/breakout-bullrun/bootstrap.js` |
| `snake` | `/games/snake-run/` | `js/arcade/games/snake-run/bootstrap.js` |
| `tetris` | `/games/tetris-block-topia/` | `js/arcade/games/tetris/bootstrap.js` |
| `blocktopia` | `/games/block-topia-quest-maze/` | `js/arcade/games/block-topia-quest-maze/bootstrap.js` |
| `crystal` | `/games/crystal-quest/` | `js/arcade/games/crystal-quest/bootstrap.js` |

Any game not in this list is **not active**. Do not create new game directories
without adding a manifest entry.

---

## Fullscreen Shell Architecture

**One shell. One entry point.**

| File | Role |
|---|---|
| `css/game-fullscreen.css` | All fullscreen overlay styles (V2) |
| `js/game-fullscreen.js` | Fullscreen overlay runtime (V2) |

Both files are loaded by every active game page via:

```html
<link rel="stylesheet" href="/css/game-fullscreen.css">
<script src="/js/game-fullscreen.js"></script>
```

`game-fullscreen.js` is an IIFE. It self-initialises on load, detects which game
is on the page via `GAME_META` canvas-ID lookup, and mounts the overlay DOM.

### Overlay lifecycle (single path)

```
page load → game-fullscreen.js IIFE runs
  → detectMeta() identifies game by canvas/element ID
  → overlay DOM built: #game-overlay (toolbar + drawers + game-stage + touch-pad)
  → startBtn clicked → openOverlay()
    → body.overlay-open added
    → #game-overlay.active shown
    → buildTouchPad(meta) called
    → arcade-overlay-open event dispatched
  → overlay close → closeOverlay()
    → body.overlay-open removed
    → #game-overlay.active hidden
    → arcade-overlay-close event dispatched
  → viewport resize / orientation → dispatchUiState('arcade-overlay-resize')
```

### Overlay DOM structure (single structure)

```
#game-overlay
  #overlay-ctrl-bar          ← toolbar (34px fixed height)
    #overlay-game-label
    #overlay-mute-btn
    #overlay-modifiers-btn
    #overlay-data-btn
    #overlay-faction-btn
    #overlay-fs-btn
    #overlay-exit-btn
  .overlay-side.overlay-side--left   ← data/stats drawer
  .overlay-side.overlay-side--right  ← faction drawer
  .overlay-modifiers-panel           ← modifiers drawer
  .game-stage                        ← canvas fills this
    .game-card                       ← stripped card chrome
  .overlay-touch-pad                 ← portrait touch controls
  .overlay-touch-landscape           ← landscape split controls (coarse pointer only)
```

### CSS custom properties (single set)

| Property | Default | Purpose |
|---|---|---|
| `--overlay-toolbar-height` | `34px` | Toolbar height budget |
| `--overlay-touch-height` | `0px` | Touch pad height budget |
| `--overlay-stage-gap` | `8px` | Gap around game stage |
| `--overlay-canvas-aspect` | set per game | Canvas aspect ratio for CSS sizing |

---

## Canvas Sizing — One Path Per Game

All canvas sizing flows through **one** mechanism: the bootstrap's
`applyFullscreenFit()` / resize handler, listening to:

- `window resize`
- `arcade-overlay-resize` (custom event from `game-fullscreen.js`)

CSS provides the outer bounds via `.game-stage` (fills the viewport minus toolbar
and touch chrome). The bootstrap reads `.game-stage` dimensions and sets
`canvas.width`, `canvas.height`, and `canvas.style` inline bounds.

**Per-game sizing entry:**

| Game | Sizing function | Canvas ID |
|---|---|---|
| asteroid-fork | `applyFullscreenFit()` in bootstrap | `astCanvas` |
| snake-run | resize handler in bootstrap | `snakeCanvas` |
| invaders | resize handler in bootstrap | `invCanvas` |
| pac-chain | resize handler in bootstrap | `pacCanvas` |
| breakout-bullrun | resize handler in bootstrap | `brkCanvas` |
| tetris-block-topia | resize handler in bootstrap | `tetCanvas` |
| block-topia-quest-maze | Phaser ScaleManager + `arcade-overlay-resize` | `btqmCanvas` |
| crystal-quest | CSS-driven (text layout, no canvas resize needed) | `questTitle` (element) |

There is **no** separate canvas sizing layer in `game-fullscreen.js`. The shell
only manages the stage container. Each game owns its own canvas dimensions.

---

## Touch Control System — One System

**Single builder registry** in `js/game-fullscreen.js` (`buildTouchPad`):

| Scheme key | Games | Controls built |
|---|---|---|
| `dpad` | snake-run, pac-chain | 3×3 D-pad grid |
| `dpad-bomb` | block-topia-quest-maze | D-pad + bomb button |
| `lr-launch` | breakout-bullrun | ← → + launch button |
| `lr-fire` | invaders-3008 | ← → + fire button |
| `asteroid` | asteroid-fork | rotate-L / thrust / rotate-R / fire row |
| `tetris` | tetris-block-topia | ← rotate → / soft-drop / hard-drop |
| `null` | crystal-quest | no touch pad (keyboard input game) |

**Landscape split** (coarse pointer, landscape orientation):
- Class: `.overlay-touch-landscape` / `.touch-gamepad-split`
- Left zone: D-pad or rotate/thrust controls
- Right zone: fire/action button
- CSS entry: `game-fullscreen.css` lines ~899–1060

**Portrait** (all touch devices in portrait):
- `.overlay-touch-pad` at bottom of overlay
- Height controlled by `--overlay-touch-height`

There is **no** legacy touch system. No separate mobile JS file. No third-party
joystick library.

---

## HUD / Overlay Panel System — One System

Three slide-in drawers, all sharing one open/close toggle in `game-fullscreen.js`:

| Drawer | Button | Panel class | Content |
|---|---|---|---|
| Data | `#overlay-data-btn` | `.overlay-side--left` | Run stats, XP preview, score |
| Modifiers | `#overlay-modifiers-btn` | `.overlay-modifiers-panel` | Cross-game modifier cards (docked from `#cm-modifier-panel`) |
| Faction | `#overlay-faction-btn` | `.overlay-side--right` | Faction HUD card |

Toggle function: `toggleOverlayPanel(panelKey)` in `game-fullscreen.js`.
Panel state managed by `OVERLAY_PANEL_CONFIG` map.

There is **no** legacy card HUD, no V1 panel system, no separate data overlay.

---

## Per-Game Runtime Entry Files

Each game page loads scripts in this order:

```html
<link rel="stylesheet" href="/css/wiki.css">
<link rel="stylesheet" href="/css/game-fullscreen.css">
<!-- per-game inline <style> if needed -->
<script data-cfasync="false" src="/js/wiki.js"></script>
<script src="/js/identity-gate.js"></script>
<script src="/js/scroll-shell.js"></script>
<script src="/js/game-fullscreen.js"></script>
<script src="/js/api-config.js"></script>
<script src="/js/components/ui-status-copy.js"></script>
<script src="/js/arcade/core/global-event-bus.js"></script>
<script src="/js/core/moonboys-state.js"></script>
<script src="/js/faction-alignment.js"></script>
<script src="/js/components/connection-status-panel.js"></script>
<script src="/js/components/global-player-header.js"></script>
<script src="/js/components/live-activity-summary.js"></script>
<script data-cfasync="false" src="/js/components/telegram-sync-cta.js"></script>
<script type="module">
  import { mountGame } from '/js/arcade/core/game-shell.js';
  import { GAME_ADAPTER } from '/js/arcade/games/<id>/bootstrap.js';
  import { mountModifierPanel } from '/js/arcade/systems/cross-game-modifier-ui.js';
  import { mountFactionHud } from '/js/arcade/ui/faction-hud.js';
  mountGame({ root: document.querySelector('.game-card'), bootstrap: GAME_ADAPTER });
  mountModifierPanel();
  mountFactionHud();
</script>
```

**Active runtime modules (one path each):**

| Module | Path |
|---|---|
| Game loop engine | `js/arcade/engine/BaseGame.js` |
| Game adapter factory | `js/arcade/engine/game-adapter.js` |
| Game shell mount | `js/arcade/core/game-shell.js` |
| Score submission | `js/leaderboard-client.js` |
| ArcadeSync XP | `js/arcade-sync.js` |
| Modifier system | `js/arcade/systems/cross-game-modifier-system.js` |
| Modifier UI | `js/arcade/systems/cross-game-modifier-ui.js` |
| Faction HUD | `js/arcade/ui/faction-hud.js` |
| Event bus | `js/arcade/core/global-event-bus.js` |
| Pre-run context panel | `js/arcade/core/run-context-panel.js` |
| Post-run summary panel | `js/arcade/core/run-summary-panel.js` |

---

## Active XP / Leaderboard / ArcadeSync

**Do not touch unless explicitly required.**

| System | Entry |
|---|---|
| ArcadeSync XP | `js/arcade-sync.js` |
| Score submit | `js/leaderboard-client.js` → `workers/leaderboard/` |
| Leaderboard worker | `workers/leaderboard/leaderboard-worker.js` |
| Telegram auth | `workers/leaderboard/` (verifyLeaderboardTelegramAuth) |
| Roguelite loop | `js/arcade/core/` systems |

---

## Removed / Deprecated Systems

The following were deleted in the 2026-05-20 cleanup. Do not re-add.

| Removed | Reason |
|---|---|
| `games/core/` | Legacy BaseGame stub — active engine is `js/arcade/engine/BaseGame.js` |
| `games/js/` | Unused legacy Phaser blocktopia prototype files |
| `games/template/` | Dev scaffold — not in manifest, not active |
| `img/games/` | Dead asset directory (unreferenced `blocktopia-cover.svg`) |
| `js/agent-hack.js` | UI hack utility — no live references |
| `js/audio-manager.js` | Unimplemented audio system — no audio assets exist |
| `js/bonus-engine.js` | Dead bonus popup engine — not wired to any game |
| `js/btqm-widget.js` | Dead homepage widget — not wired to any page |
| `js/particle-engine.js` | Dead particle system — not used by any game |
| `js/site-season-banner.js` | Dead season banner — not used by any page |
| `artifacts/` | Screenshot artifacts from past PRs — not live code |
| `patches/` | Git patch files from past PRs — not live code |
| `audio/` | Empty placeholder directory — audio system was never implemented |
| HexGL | Already retired before this cleanup; no code references existed |

---

## Validation

Run these to confirm the repo is clean:

```bash
npm test
node scripts/arcade-sanity.test.mjs
node scripts/repo-consistency-audit.mjs
node scripts/anti-drift-check.mjs
node scripts/arcade-architecture-audit.mjs
```

All must exit 0. Warnings in arcade-architecture-audit are expected (data-game-id
migration is in progress, tracked separately).

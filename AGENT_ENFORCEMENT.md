# Agent Enforcement — Level 2

This document records the structural rules enforced automatically by
`scripts/anti-drift-check.mjs` and the GitHub Actions workflow
`.github/workflows/anti-drift-check.yml`.

---

## Enforced Rules

### 1 — Required root files
The following files **must always** exist at the repository root:

| File | Reason |
|------|--------|
| `README.md` | Primary project documentation |
| `robots.txt` | SEO / crawler control (must stay at root) |
| `.nojekyll` | Prevents GitHub Pages Jekyll processing |
| `index.html` | Site entry point |
| `CNAME` | Custom domain binding |

### 2 — Required arcade game directories
All eight live arcade games must remain present:

- `games/invaders-3008`
- `games/asteroid-fork`
- `games/breakout-bullrun`
- `games/pac-chain`
- `games/snake-run`
- `games/tetris-block-topia`
- `games/crystal-quest`
- `games/block-topia-quest-maze`

The arcade manifest (`js/arcade/arcade-manifest.js`) must contain **exactly** these eight game IDs:
`invaders`, `pacchain`, `asteroids`, `breakout`, `snake`, `tetris`, `blocktopia`, `crystal`.

> **Manifest IDs ≠ folder/route names.** Some folder names differ from their manifest ID:
>
> | Manifest ID | Folder / Route |
> |---|---|
> | `breakout` | `games/breakout-bullrun/` |
> | `snake` | `games/snake-run/` |
>
> Do **not** document `breakout-bullrun` or `snake-run` as manifest IDs.
> They are route/directory names only. The manifest ID is the canonical key used
> for leaderboard submissions, XP accounting, and adapter registration.

### 3 — Forbidden paths
The following paths were removed by design and must **not** be re-introduced:

| Path | Removed reason |
|------|----------------|
| `games/block-topia/world/` | Block Topia clean-state reset |
| `games/block-topia/ui/` | Block Topia clean-state reset |
| `games/block-topia/economy/` | Block Topia clean-state reset |
| `games/block-topia/duel/` | Block Topia clean-state reset |
| `games/hexgl/` | Dead game — removed in arcade cleanup |
| `games/hexgl-local/` | Dead game — removed in arcade cleanup |
| `games/hexgl-monster-max/` | Dead game — removed in arcade cleanup |
| `js/arcade/games/hexgl/` | Dead bootstrap — removed in arcade cleanup |
| `js/arcade/games/hexgl-monster/` | Dead bootstrap — removed in arcade cleanup |
| `js/arcade/games/hexgl-monster-max/` | Dead bootstrap — removed in arcade cleanup |
| `js/arcade/games/blocktopia-phaser/` | Dead bootstrap — removed in arcade cleanup |
| `js/arcade/games/blocktopia-social-hub/` | Dead bootstrap — removed in arcade cleanup |
| `js/arcade/games/breakout/` | Superseded by `breakout-bullrun` (folder) / manifest ID `breakout` |
| `js/arcade/games/snake/` | Superseded by `snake-run` (folder) / manifest ID `snake` |

### 4 — README.md content
`README.md` must contain the headings:

- `Repository Scope`
- `Arcade Structure`
- `Current Live Arcade Games`

### 5 — Block Topia clean state
`games/block-topia/main.js` and `network.js` must not reference:

- `PressureProtocol`
- `street-signal`
- `solo mode`

### 6 — robots.txt location
`robots.txt` must remain at the repository root and must not be duplicated
inside game subdirectories.

### 7 — Arcade index pages
Active game `index.html` files must not reference forbidden scripts:

- `hexgl-score-submit`
- `pressure-protocol`
- `street-signal`

### 8 — MOONBOYS_STATE mutation guard
`MOONBOYS_STATE.xp`, `.faction`, `.sync`, and `.lastEvent` must not be written
directly by any file other than `js/core/moonboys-state.js`.
`window.MOONBOYS_STATE` must not be directly reassigned outside that file.

### 9 — Bus-driven UI state update guard
Bus listeners in component files (`live-activity-summary.js`,
`connection-status-panel.js`) may only append log entries.  Sync, faction, and XP
UI rows must be updated exclusively via `MOONBOYS_STATE.subscribe()`.

### 10 — LAS subscriber-only contract
`js/components/live-activity-summary.js` must:

- Contain `MOONBOYS_STATE.subscribe`.
- Call `updateSyncUI(state.sync)` inside the subscriber.
- **Not** call `updateSyncUI()` (no-arg) inside `bus.on('sync:state')`.
- **Not** call `refresh()` inside any bus listener.

### 11 — CSP XP display contract
`js/components/connection-status-panel.js` must:

- Read Arcade XP exclusively via `MOONBOYS_STATE.getState()`.
- Not call `mount()` inside `bus.on('xp:update')` (no full-panel remount on XP).
- Not reference `arcade_xp_total` (that field belongs to `moonboys-state.js`).

### 12 — Auth constant consistency
`TELEGRAM_AUTH_MAX_AGE_SECONDS` must be the same value in all three locations:
`workers/leaderboard-worker.js`, `workers/moonboys-api/blocktopia/config.js`, and
`js/identity-gate.js`.

`SEASON_EPOCH_MS` must be defined in `workers/leaderboard-worker.js`; if also
present in `workers/moonboys-api/worker.js`, the values must be identical.

---

## Global UI Interaction System — Removal (checks 13–16)

The Tron React Engine (`js/tron-react-engine.js`), Tron Audio
(`js/tron-audio.js`), and their CSS (`css/tron-react-engine.css`) were
permanently deleted. Checks 13–16 enforce that no part of that system
is re-introduced anywhere in the repo's shell (non-gameplay) files.

### 13 — Deleted global UI identifiers must not return
The following must not appear in any shell JS, CSS, or HTML file:

| Identifier / pattern | What was deleted |
|---|---|
| `tron-react-engine` | Deleted JS module |
| `tron-audio` | Deleted JS module |
| `tron-react-engine.css` | Deleted CSS file |
| `TRON_AUDIO` | Deleted global |
| `window.TRON` | Deleted global |
| `ensureTronAssets` | Deleted loader function |
| `emitTron` | Deleted event emitter |
| `hoverSound` / `clickSound` | Deleted UI sound helpers |
| `TRON_AUDIO.play` | Deleted audio call |
| `tron:event` / `tron:wake` / `tron:wakeup` | Deleted custom events |
| `tron:hover` / `tron:click` | Deleted custom events |
| `tron:sam` / `tron:leaderboard` / `tron:score` | Deleted custom events |
| `tron:api-online` / `tron:api-offline` | Deleted custom events |
| `syncPulseGreen` | Deleted CSS @keyframes |
| `edgeFlicker` / `neonFramePulse` / `neonCornerGlitch` | Deleted CSS @keyframes |
| `heroBgDrift` / `home-neon-haze` | Deleted CSS @keyframes |
| `pulse-grid` / `trace-scan` | Deleted CSS @keyframes |

**Exempt:** `js/arcade/**`, `js/audio-manager.js`, `js/arcade-meta-ui.js`,
`js/arcade-retention-engine.js`, `css/game-fullscreen.css`, and all game
runtime `index.html` files — these contain legitimate gameplay audio/animation.

### 14 — Shell CSS: no motion transform/animation on interactive elements
Global CSS files (`css/*.css`, excluding `game-fullscreen.css`) must not:

- Apply `transform:` (non-`text-transform`) inside `:hover`, `:active`, or
  `:focus-visible` rules.
- Apply `animation:` (non-`none`) on interactive shell selectors (`a`, `button`,
  `.btn`, `.article-card`, `.category-card`, `.article-list-item`, `.faction-btn`,
  `.battle-link-card`, `.price-card`, `.home-widget`, `.retro-pixel-card`,
  `.launch-cta`, `.home-search`, `#back-to-top`, `.lb-tab`).

### 15 — Non-gameplay JS: no UI audio creation
Shell JS files (all `js/**` except `js/arcade/**`, `js/audio-manager.js`,
`js/arcade-meta-ui.js`, `js/arcade-retention-engine.js`) must not:

- Instantiate `new Audio(...)`, `window.Audio(...)`, or `globalThis.Audio(...)`.
- Call `hoverSound()`, `clickSound()`, `TRON_AUDIO.play()`, or reference `window.TRON_AUDIO`.

### 16 — No removed-effect comment remnants
Shell JS, CSS, and HTML files must not contain comments that reference the
deleted interaction system:

- `TRON REACT ENGINE`, `tron-audio`, `hoverSound`, `clickSound`, `emitTron`,
  `ensureTronAssets` appearing in JS/CSS comment lines.

---

### 20 — Arcade hub and sidebar parity with manifest
`games/index.html` (arcade hub) and the arcade sidebar section in `js/site-shell.js`
must contain a link to **every** game page listed in `ARCADE_MANIFEST`.

Specifically, all eight manifest `page` values must appear as `href` attributes in each:

- `/games/invaders-3008/`
- `/games/pac-chain/`
- `/games/asteroid-fork/`
- `/games/breakout-bullrun/`
- `/games/snake-run/`
- `/games/tetris-block-topia/`
- `/games/block-topia-quest-maze/`
- `/games/crystal-quest/`

These lists may contain extra links (e.g. Block Topia Multiplayer) — only omissions fail.

This prevents a manifest game from being added/removed without updating the display lists.

---

## Adding New Rules

1. Add the check logic to `scripts/anti-drift-check.mjs`.
2. Document it in this file under a new numbered section.
3. Open a PR — the workflow will verify the new rule works before merge.

## Workflow

The CI workflow (`.github/workflows/anti-drift-check.yml`) runs on every push
and pull request.  A non-zero exit from the script fails the job and blocks
merging when branch protection is enabled.

**Do not** bypass or delete this workflow.

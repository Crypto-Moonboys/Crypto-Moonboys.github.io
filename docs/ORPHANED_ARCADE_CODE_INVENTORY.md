# Orphaned Arcade Code Inventory

This document records code directories that exist in the repository but are **not active games**: not in `js/arcade/arcade-manifest.js`, not linked from live game nav sidebars as active entries, and/or superseded by newer implementations.

> **Purpose:** Prevent future agents from accidentally treating these as live games, and give a clear record of what to clean up in a dedicated cleanup PR.

---

## js/arcade/games — Orphaned Directories

### 1. `js/arcade/games/breakout/`

| Field | Value |
|---|---|
| Referenced anywhere | No manifest entry. `bootstrap.js` exists and uses `GameRegistry` — this is the original Breakout before Breakout Bullrun. |
| Superseded by | `js/arcade/games/breakout-bullrun/` (manifest id: `breakout-bullrun`) |
| Safe action | **Delete in a later cleanup PR** after confirming no assets are shared. |
| Reason | Not in manifest, not reachable from any game page. Dead code. |

---

### 2. `js/arcade/games/snake/`

| Field | Value |
|---|---|
| Referenced anywhere | No manifest entry. `bootstrap.js` exists — original Snake implementation. |
| Superseded by | `js/arcade/games/snake-run/` (manifest id: `snake-run`) |
| Safe action | **Delete in a later cleanup PR** after confirming no assets are shared. |
| Reason | Not in manifest, not reachable from any game page. Dead code. |

---

### 3. `js/arcade/games/hexgl/`

| Field | Value |
|---|---|
| Referenced anywhere | No manifest entry. `bootstrap.js` exists — base HexGL wrapper. |
| Superseded by | `js/arcade/games/hexgl-monster-max/` (manifest id: `hexgl`) |
| Safe action | **Delete in a later cleanup PR** after confirming no assets or shaders are shared with hexgl-monster-max. |
| Reason | Not in manifest, not reachable from any game page. Dead code. |

---

### 4. `js/arcade/games/hexgl-monster/`

| Field | Value |
|---|---|
| Referenced anywhere | No manifest entry. `bootstrap.js` exists — intermediate HexGL Monster build before monster-max. |
| Superseded by | `js/arcade/games/hexgl-monster-max/` (manifest id: `hexgl`) |
| Safe action | **Delete in a later cleanup PR** after confirming no assets or shaders are shared with hexgl-monster-max. |
| Reason | Not in manifest, not reachable from any game page. Dead code. |

---

### 5. `js/arcade/games/blocktopia-phaser/`

| Field | Value |
|---|---|
| Referenced anywhere | No manifest entry. `bootstrap.js` exists — Phaser-based Block Topia experiment. |
| Superseded by | `games/block-topia/` (live 2P multiplayer base) and `js/arcade/games/block-topia-quest-maze/` (manifest id: `blocktopia`) |
| Safe action | **Needs investigation** before deletion. May contain Phaser-specific assets or prototyped mechanics not yet present elsewhere. |
| Reason | Not in manifest, not reachable from any game page. Likely dead code, but warrants a quick review before removal. |

---

### 6. `js/arcade/games/blocktopia-social-hub/`

| Field | Value |
|---|---|
| Referenced anywhere | No manifest entry. `bootstrap.js` exists — Social Hub concept for Block Topia. |
| Superseded by | Not directly superseded; may represent a planned feature. |
| Safe action | **Needs investigation** before deletion. May contain prototyped social-hub mechanics relevant to the Block Topia roadmap. |
| Reason | Not in manifest, not reachable from any game page. |

---

## games/ — Disconnected Game Directories

### 7. `games/hexgl-local/`

| Field | Value |
|---|---|
| Description | Standalone offline HexGL fork with its own `bkcore/`, `libs/`, `css/`, `audio/`, and `textures/` directories. Self-contained. |
| Referenced anywhere | Not linked from any nav, not in arcade manifest, not connected to Arcade XP or leaderboard. |
| Superseded by | `games/hexgl-monster-max/` (active manifest entry) |
| Safe action | **Keep temporarily** — pending asset review. The `textures/`, `audio/`, and `geometries/` directories may contain source assets used by or useful to `hexgl-monster-max`. Remove in a dedicated cleanup PR after confirming no assets are shared. |
| Reason | Not reachable from any page. Dead code for runtime purposes. |

---

## patches/ — Applied Historical Patch Files

### 8. `patches/`

| Field | Value |
|---|---|
| Files | `0001-feat-invaders-major-roguelite-upgrade-new-enemies-bo.patch`, `0002-fix-invaders-address-code-review-issues.patch` |
| Description | Historical git-format-patch files from the Invaders 3008 roguelite upgrade (April 2026). The changes in these patches are already applied to the live codebase (meta-system, intensity feedback, run-summary screen). |
| Referenced anywhere | Not referenced by any build script, CI workflow, or tooling. No tooling uses this directory. |
| Safe action | **Delete in a later cleanup PR** — confirm no tooling references `patches/`. Already verified: no `.yml`, `.mjs`, `.json`, or `.sh` references found. |
| Reason | Already-applied patch artifacts. Kept here for historical reference but serve no runtime purpose. |

---

## Validation

To confirm no orphaned directory is accidentally referenced in the arcade manifest, run:

```bash
node scripts/repo-consistency-audit.mjs
```

This script checks that none of the orphaned directories listed above appear as `bootstrapPath` entries in `js/arcade/arcade-manifest.js`.

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
`invaders`, `pacchain`, `asteroids`, `breakout-bullrun`, `snake-run`, `tetris`, `blocktopia`, `crystal`.

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
| `js/arcade/games/breakout/` | Superseded by `breakout-bullrun` |
| `js/arcade/games/snake/` | Superseded by `snake-run` |

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

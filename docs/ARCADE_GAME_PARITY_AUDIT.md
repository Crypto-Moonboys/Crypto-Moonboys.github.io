# Arcade Game Parity Audit

**Scope:** Active arcade games audited for progression-impact standard.
**Date:** 2026-05-02

Active games: Invaders 3008, Pac-Chain, Asteroid Fork, Breakout Bullrun, SnakeRun 3008, Tetris Block Topia, Block Topia Quest Maze

---

## Legend

| Mark | Meaning |
|------|---------|
| ✅ Live | Fully implemented and wired |
| ⚠️ Partial | Present but incomplete or not emitting all hooks |
| ❌ Missing | Not present; needs to be added |
| — Exception | Not applicable to this game type — documented exception in `arcade-game-parity-audit.mjs` |

---

## Parity Feature Matrix

All active games in this audit meet baseline parity for score submission, leaderboard visibility, and post-run progression tracking.
Game-specific exceptions remain documented where mechanics are format-dependent (especially Block Topia Quest Maze runtime differences).

---

## Game-Specific Notes

### Invaders 3008 (`invaders`)
- Most feature-complete game in the arcade.
- Has full upgrade system, director, event pressure, boss archetypes, mutation system.
- Faction effects apply at run start (chaos rate, starting shields, score).
- Mission hooks fire on run_started, run_completed, survived_time, combo_hit, boss_defeated.
- Uses shared `upgrade-system.js` (Invaders-specific impl, not arcade-upgrade-system).

### Pac-Chain (`pacchain`)
- Full faction imports and mission/contribution hooks wired in bootstrap.
- Has local upgrade definitions (speed, pelletValue, powerDuration, shield, ghostSlow, chainBonus, revive).
- Uses level modifiers (blackout, speedGhosts, cursedPellets, fruitRush, reverseControls).
- Mobile touch controls: partial (maze routing is pointer-based but no dedicated mobile pad).

### Asteroid Fork (`asteroids`)
- Full system suite via factory pattern (upgrade, director, event, mutation, boss, risk, meta, feedback).
- Has crystal/cursed asteroid types — aligns with rare spawn concept.
- Faction effects applied at run init.

### Breakout Bullrun (`breakout-bullrun`)
- Has rich local upgrade catalogue (multiBall, paddleSize, laser, shieldFloor, explosive, fireball, revive).
- Cross-game modifier applied (scoreMult, shieldedStart, pressureRate, magnetPickups, recoveryPulse).
- Added: faction effects, mission hooks, contribution hooks, event bus emissions (this PR).

### SnakeRun 3008 (`snake-run`)
- Has upgrade system (speed-control, segment-growth, score-mult, shield-segment, ghost-phase, magnet-food, auto-turn, split-snake).
- Cross-game modifiers applied.
- Added: faction effects, mission hooks, contribution hooks, event bus emissions (this PR).

### Tetris Block Topia (`tetris`)
- Full faction imports, mission hooks, contribution hooks, live-activity integration.
- Mutation system (heavy, ghost, golden, cursed pieces).
- Upgrade system (scoreBoost, dropSlowdown, comboBonus, shield, ghost, levelRush, revive).
- Director events (speedBurst, garbageLine, mirrorFlip, powerClear, doubleScore).

### Block Topia Quest Maze (`blocktopia`)
- Phaser 3 RPG dungeon crawler — 6 crypto-themed zones, turn-based battles, daily reset.
- **Documented exception:** faction-effect-system, cross-game-modifier-system, mission hooks, and faction contribution hooks are not wired in the current IIFE/Phaser bootstrap. These are exempted in `arcade-game-parity-audit.mjs` and produce WARN (not FAIL) during automated checks.
- **What BTQM does have:** full submitScore + ArcadeSync, post-run score submission, game-over CTA, audio/FX system, milestone/meta tracking, in-run upgrades, boss encounters.
- Score and ArcadeSync integration meet the minimum parity standard for this format.

---

## Remaining Gaps (After This PR)

| Gap | Risk | Notes |
|-----|------|-------|
| Mobile touch pads for action games | Low | Existing gamepad overlays; game-by-game effort |
| Shared `arcade-upgrade-system.js` deep integration | Low | Shared system created; games retain local catalogues mapped to shared categories |
| Tetris `crossGameTags` — only `physics`, missing `puzzle` | Low | Tetris has director/event system; `puzzle` tag could be added but not breaking |

---

*This audit document is updated as part of the Arcade Game Parity PR.*

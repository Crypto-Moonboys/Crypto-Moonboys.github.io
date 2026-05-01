# Arcade Game Parity Audit

**Scope:** Active arcade games audited for progression-impact standard.
**Date:** 2026-05-01

Active games: Invaders 3008, Pac-Chain, Asteroid Fork, Breakout Bullrun, SnakeRun 3008, Tetris Block Topia, Crystal Quest

---

## Legend

| Mark | Meaning |
|------|---------|
| ✅ Live | Fully implemented and wired |
| ⚠️ Partial | Present but incomplete or not emitting hooks |
| ❌ Missing | Not present; needs to be added |
| — N/A | Not applicable to this game type |

---

## Parity Feature Matrix

| Feature | Invaders 3008 | Pac-Chain | Asteroid Fork | Breakout Bullrun | SnakeRun 3008 | Tetris Block Topia | Crystal Quest |
|---|---|---|---|---|---|---|---|
| **Faction effects** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live |
| **Cross-game modifier support** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live |
| **In-run upgrades** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | — N/A |
| **Upgrade selection screen** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | — N/A |
| **Boss / elite / pressure events** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | — N/A |
| **Rare reward / rare spawn system** | ✅ Live | ✅ Live | ✅ Live | ⚠️ Partial | ✅ Live | ✅ Live | — N/A |
| **Combo / streak system** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live |
| **Shield / defense system** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | — N/A |
| **Mission progress hooks** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live |
| **Faction contribution hooks** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live |
| **Post-run reward breakdown** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live |
| **Sound / visual feedback** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live |
| **Game-over CTA (Battle Chamber / Leaderboard)** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live |
| **Mobile-safe controls** | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | ✅ Live |
| **Pre-run context panel** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live |
| **Event bus: arcade:perk-triggered** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live |
| **Event bus: arcade:upgrade-selected** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | — N/A |
| **Event bus: arcade:mission-progress** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live |
| **Event bus: arcade:faction-signal** | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ✅ Live |
| **Shared arcade-upgrade-system integration** | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | — N/A |

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

### Crystal Quest (`crystal`)
- Quiz/lore game — no canvas/physics mechanics.
- Added: faction effects (score, combo, rare spawn bias), mission hooks, contribution hooks, event bus emissions (this PR).
- Mobile-safe: text input, no directional controls needed.
- N/A: upgrades, bosses, shield system — not applicable to quiz format.

---

## Remaining Gaps (After This PR)

| Gap | Risk | Notes |
|-----|------|-------|
| Mobile touch pads for action games | Low | Existing gamepad overlays; game-by-game effort |
| Shared `arcade-upgrade-system.js` deep integration | Low | Shared system created; games retain local catalogues mapped to shared categories |
| Tetris `crossGameTags` — only `physics`, missing `puzzle` | Low | Tetris has director/event system; `puzzle` tag could be added but not breaking |
| Crystal Quest — no upgrade layer | N/A | Quiz format; not applicable |

---

*This audit document is updated as part of the Arcade Game Parity PR.*

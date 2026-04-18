# 🎲 WTF Bonus System — Moonboys Arcade

> *"You don't find the WTF bonus. The WTF bonus finds you."*

---

## Overview

The **WTF Bonus System** is the hidden reward layer powering all Moonboys Arcade games.  
It is loaded from a shared pool (`/games/data/hidden_bonus_pool.json`) and evaluated
by `bonus-engine.js` after each meaningful game event (correct answer, food eaten, etc.).

---

## Bonus Pool (`hidden_bonus_pool.json`)

The pool defines **10 bonuses** across 6 rarity tiers:

| Rarity    | Weight | Example Bonus        | Points |
|-----------|--------|----------------------|--------|
| common    | 50     | Quick Hands          | 50     |
| uncommon  | 25     | HODL Streak          | 80     |
| rare      | 12     | Diamond Reflex       | 150    |
| epic      | 8      | Hidden Vault         | 300    |
| legendary | 4      | SIGMA Protocol       | 800    |
| **wtf**   | **1**  | **MOONSHOT**         | **1500** |

Higher rarity = lower weight = rarer occurrence.  
The WTF tier fires at approximately **1-in-100** chance relative to common.

---

## Trigger Types

Each bonus has a `trigger` that must pass for it to be eligible in a roll:

| Trigger Type         | Description                                              |
|----------------------|----------------------------------------------------------|
| `score_within_time`  | Player reached a score threshold within a time window    |
| `streak`             | Player maintained a consecutive streak of N actions      |
| `score_threshold`    | Player's cumulative score passed a number                |
| `near_miss`          | Player survived N near-miss events                       |
| `first_score`        | Player scored their very first point this session        |
| `secret_event`       | Ultra-rare random event (0.5% per action)                |
| `random_event`       | WTF-grade chaos event (0.2% per action)                  |

---

## How the Roll Works

```
rollHiddenBonus(context)
  1. Load pool from hidden_bonus_pool.json (cached per page load)
  2. Filter bonuses:
     - Not already fired this session (sessionStorage per game)
     - Trigger condition passes for current context
  3. Weighted-random select from eligible bonuses using rarity_weights
  4. Return winner (or null)
```

Each bonus fires **at most once per game session** via `sessionStorage`.  
The WTF-tier `MOONSHOT` bonus resets between sessions, so it can fire on every new play.

---

## Integration Points

### Crystal Quest
- Rolled after every **correct answer**: `rollHiddenBonus({ score, streak, game: 'crystal' })`
- Bonus points added to session score and re-submitted to leaderboard

### SnakeRun 3008
- `AUDIO_HOOK: play('game_over')` and `// AUDIO_HOOK: play('eat')` mark future integration points
- Add `rollHiddenBonus({ score, streak, game: 'snake' })` in `onGameOver()` for Snake bonuses

### Block Topia Quest Maze
- Battle outcomes can trigger `score_threshold` and `streak` bonuses
- Wire `rollHiddenBonus({ score, streak, game: 'blocktopia' })` after battle wins

---

## Adding a New Bonus

1. Add an entry to `hidden_bonus_pool.json`:
   ```json
   {
     "id": "your_bonus_id",
     "name": "Your Bonus Name",
     "rarity": "rare",
     "description": "What it does.",
     "trigger": { "type": "streak", "count": 15 },
     "effects": { "multiplier": 1.2, "duration_seconds": 10 }
   }
   ```
2. The engine picks it up automatically — no code changes required.
3. Optionally add a `bonus_<rarity>.ogg` file to `/audio/sfx/` for custom audio.

---

## WTF Tier Special Rules

The `wtf` rarity tier is intentionally ludicrous:
- **MOONSHOT** awards **1500 arcade points** — the highest single bonus in the game
- It fires via `random_event` trigger (0.2% per qualifying action)
- It also fires via `score_threshold` at 1000 points via the `sigma_protocol` stack
- When MOONSHOT fires, a full-screen popup with pink glow appears
- In future builds, a particle explosion and sound effect accompany it

---

## Session Safety

The engine tracks fired bonuses per game in `sessionStorage`:
```
bonus_fired_crystal  →  ["quick_hands", "hodl_streak"]
bonus_fired_snake    →  []
bonus_fired_blocktopia → ["hidden_vault"]
```

This prevents the same bonus from firing multiple times in one session,
preserving the surprise and rarity of each event.

---

## File Map

| File                                    | Purpose                                |
|-----------------------------------------|----------------------------------------|
| `/games/data/hidden_bonus_pool.json`    | Canonical bonus pool definition        |
| `/js/bonus-engine.js`                   | Roll logic, trigger evaluation, popup  |
| `/js/audio-manager.js`                  | Audio playback (future sound hooks)    |
| `/audio/sfx/bonus_*.ogg`               | Per-rarity sound assets (placeholder)  |

# 🎮 Moonboys Arcade — Technical Whitepaper

**Version:** 1.0  
**Date:** April 2026  
**Status:** Production-ready

---

## Abstract

The **Moonboys Arcade** is a browser-native, zero-install gaming layer integrated directly
into the Crypto Moonboys GK Wiki. It operates without a dedicated game engine, relying instead
on Canvas 2D, vanilla ES modules, and a single Cloudflare KV-backed Worker for shared state.
This whitepaper documents the architecture, acceptance criteria, and deployment contracts.

---

## 1. Games

### 1.1 SnakeRun 3008 (`/games/snake.html`)

A real-time reflex game built on a 24×24 Canvas grid.  
- Scoring: **+10 points** per food item eaten  
- Speed: Fixed at 120ms tick rate  
- Leaderboard: Score submitted via `leaderboard-client.js` on game over  
- High score: Persisted locally via `ArcadeSync.setHighScore('snake', score)`

### 1.2 Crystal Quest (`/games/crystal-quest.html`)

A 1000-question lore-driven trivia game using the wiki as the answer source.  
- Dataset: `/games/data/crystal-maze-seed.json` (1000 questions, version 2.0)  
- **No-repeat logic:** Questions are shuffled on load and tracked in `localStorage`.  
  When all 1000 questions have been answered, the cycle resets automatically.  
- R2-first loading: `data-loader.js` tries `R2_PUBLIC_BASE_URL + path` first,  
  then falls back to the local static file  
- Scoring: Per-question `score` from the dataset rewards object  
- Bonus engine: `rollHiddenBonus()` called after every correct answer

### 1.3 Block Topia Quest Maze (`/games/block-topia-quest-maze.html`)

A turn-based RPG with combat, quests, and level progression.  
- Player state: Persisted in `localStorage` under `btqm_player`  
- Quest data: Loaded via `loadGameData()` with R2-first/local fallback  
- Leaderboard: Writes via both the KV leaderboard worker (global) and the Block Topia  
  R2-backed score worker (`/api/block-topia/score`)  
- Identity sync: Player name synced to `ArcadeSync` on creation

---

## 2. Shared Leaderboard

### 2.1 Architecture

```
Browser game
  └─ leaderboard-client.js
        ├─ POST /  → submitScore(player, score, game)
        └─ GET  /?game=<key> → fetchLeaderboard(game)
              └─ Cloudflare Worker (moonboys-leaderboard)
                    └─ KV namespace: LEADERBOARD
                          ├─ leaderboard:snake
                          ├─ leaderboard:crystal
                          ├─ leaderboard:blocktopia
                          └─ leaderboard:global  (auto-computed)
```

### 2.2 Global Score Computation

The global leaderboard is recomputed on every POST:
- Sum of per-game bests per player  
- **+100 variety bonus** if the player has scored in all 3 games  
- Sorted descending by total score, alphabetically on tie  
- Capped at 100 entries

### 2.3 Score Validation

All submitted scores are validated server-side:
- `player`: non-empty string, max 40 chars  
- `score`: non-negative finite number, max 1,000,000,000  
- `game`: lowercase alphanumeric / hyphen / underscore

### 2.4 Worker Deployment

```toml
# workers/leaderboard/wrangler.toml
name               = "moonboys-leaderboard"
main               = "../leaderboard-worker.js"
compatibility_date = "2024-11-01"

[[kv_namespaces]]
binding    = "LEADERBOARD"
id         = "a621c334d9ac439ebaf5f35dd31dddd5"
```

CI deploy: `.github/workflows/deploy-leaderboard-worker.yml` (triggers on push to `main`
when `workers/leaderboard-worker.js` changes).

---

## 3. OG Graph Node Map

The leaderboard page (`/games/leaderboard.html`) includes an interactive Canvas 2D
node graph (`/js/arcade-graph.js`) that visualises arcade relationships.

### 3.1 Overview State
Shows the three games and the bonus node radiating from a central Arcade hub.

### 3.2 Player State
Clicking a leaderboard row transitions to a player breakdown view:
- Player node at centre-left  
- Four game nodes with radius proportional to score  
- Animated dashed edges from game nodes to the global total node

### 3.3 Interactions
- Mouse hover: glow halo on node  
- Click: select node (persistent highlight)  
- Touch: tap to select  
- Reset button: returns to overview state  

---

## 4. WTF Bonus System

See `WTF_README.md` for full specification.

Summary:
- 10 bonuses across 6 rarity tiers in `hidden_bonus_pool.json`  
- `bonus-engine.js` evaluates trigger conditions after game events  
- Weighted-random selection by rarity  
- Session-scoped de-duplication via `sessionStorage`  
- Animated popup overlay with per-rarity neon colour  
- `AUDIO_HOOK` comments mark future audio integration points

---

## 5. R2 Integration

### 5.1 Data Loader
`/js/data-loader.js` provides `loadGameData(path)`:
1. If `window.R2_PUBLIC_BASE_URL` is set, try `${R2_BASE}${path}?v=<timestamp>` (cache-busted)
2. On failure or empty R2 URL, fall back to local static file

### 5.2 Block Topia R2 Worker
A separate Cloudflare Worker (`workers/block-topia/`) handles Block Topia leaderboard
persistence to R2:
- `POST /api/block-topia/score` — upserts entry into `leaderboards/current-season.json`
  and `leaderboards/masters-all-time.json` in the configured R2 bucket
- Binding name: `R2_BUCKET`; bucket name: configured in `wrangler.toml` / secret

### 5.3 Environment Variables (non-secret)
Per `docs/r2-worker-env.md`:
```
R2_LEADERBOARD_PREFIX    = "leaderboards"
MAZE_SEASON_LENGTH_DAYS  = "90"
MAZE_YEARLY_RESET_UTC    = "12:00"
```

---

## 6. Audio & Visual Assets

### 6.1 Visual
All game visual assets live under `/img/game/`:
- `backgrounds/` — full-page and canvas backgrounds  
- `bonuses/` — per-bonus SVG + PNG icons  
- `characters/` — player and enemy sprites  
- `icons/` — HUD icons (XP, HP, energy, punk, quest, achievement)  
- `logos/` — game and arcade logos  
- `snake/` — snake-specific sprites

### 6.2 Audio
Audio assets live under `/audio/` (currently placeholder `.gitkeep` files):
- `sfx/` — short sound effects for game events  
- `music/` — looping background tracks

`AudioManager` (`/js/audio-manager.js`) provides `loadSound()`, `playSound()`,
`playMusic()`, `stopMusic()`, and `setVolume()`. All audio hooks in game code are
marked with `// AUDIO_HOOK: play('<event>')` comments for easy wiring.

---

## 7. GitHub Workflows

| Workflow                          | Trigger                                      | Purpose                              |
|-----------------------------------|----------------------------------------------|--------------------------------------|
| `deploy-leaderboard-worker.yml`  | Push to `main` (leaderboard files)           | Deploy KV leaderboard worker         |
| `deploy-block-topia-worker.yml`  | Push to `main` (block-topia files)           | Deploy Block Topia R2 score worker   |
| `autonomous-editorial.yml`       | Daily cron (03:00 UTC) + `workflow_dispatch` | Wiki editorial operations            |
| `wiki-index-sync.yml`            | (per file)                                   | Regenerate wiki index                |

All deploy workflows require `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.  
They are **read-only** with respect to the repository (`permissions: contents: read`).

---

## 8. GitHub Pages Compatibility

The arcade is fully compatible with GitHub Pages:
- No server-side rendering or build step required  
- All paths use root-relative URLs (`/games/`, `/js/`, `/css/`, `/img/`)  
- `.nojekyll` file present at root to bypass Jekyll processing  
- All game HTML files use the standard wiki site shell (header, sidebar, footer)  
- No `../` relative paths anywhere in the arcade stack

---

## 9. Acceptance Criteria

| # | Criterion                                              | Status  |
|---|--------------------------------------------------------|---------|
| 1 | All 3 games functional in wiki shell                   | ✅ Done |
| 2 | Shared KV-backed leaderboard worker                    | ✅ Done |
| 3 | OG graph node map on leaderboard page                  | ✅ Done |
| 4 | 1000-question Crystal Quest dataset                    | ✅ Done |
| 5 | No-repeat shuffle logic in Crystal Quest               | ✅ Done |
| 6 | WTF randomiser using hidden_bonus_pool.json            | ✅ Done |
| 7 | bonus-engine.js with full bonus pool integration       | ✅ Done |
| 8 | R2 integration with local fallback                     | ✅ Done |
| 9 | Audio placeholder directory structure + hooks          | ✅ Done |
|10 | Clean, non-mutating GitHub workflows                   | ✅ Done |
|11 | README, WTF_README, WHITEPAPER documentation           | ✅ Done |

---

## 10. Deployment Checklist

- [ ] Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub repository secrets  
- [ ] Create KV namespace, update `id` in `workers/leaderboard/wrangler.toml`  
- [ ] Create R2 bucket, update `bucket_name` in `workers/block-topia/wrangler.toml`  
- [ ] Set `window.R2_PUBLIC_BASE_URL` in a site-level config or CDN header if using R2  
- [ ] Replace `/audio/sfx/*.ogg` placeholders with real sound effects  
- [ ] Replace `/audio/music/*.ogg` placeholders with real music tracks  
- [ ] Confirm leaderboard worker URL in `js/leaderboard-client.js` `PRODUCTION_LEADERBOARD_URL`

---

*Crypto Moonboys GK Wiki ⚡️⚡️⚡️ — Not financial advice.*

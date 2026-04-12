# 🌙 Crypto Moonboys Wiki

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://crypto-moonboys.github.io)
![Version](https://img.shields.io/badge/version-v2.1.0-blue)
![Status](https://img.shields.io/badge/status-stable-brightgreen)
![Architecture](https://img.shields.io/badge/architecture-multi--repo-purple)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

The **Crypto Moonboys Wiki** is a deterministic, self-evolving lore and knowledge ecosystem powered by AI-driven editorial intelligence. It operates as a **multi-repository system**, separating content, intelligence, and publishing to ensure stability, scalability, and long-term maintainability.

🌐 **Live Site:** https://crypto-moonboys.github.io

---

## 🏗️ Multi-Repository Architecture

The platform is built on a **two-repo system**, ensuring a clear separation of responsibilities.

| Repository | Role | Description |
|-----------|------|-------------|
| **Frontend / Publisher** | 🌐 Public Wiki | [`Crypto-Moonboys.github.io`](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io) — Hosts all static HTML content, UI, and generated JSON intelligence layers served via GitHub Pages. |
| **Brain / Intelligence Engine** | 🧠 AI Orchestrator | [`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE) — Hosts the SAM AI agent, memory, scoring logic, and autonomous editorial operations. |

### 🧠 SAM Memory
- Canonical shared memory stored in **Cloudflare R2**: `sam-memory.json`
- Used for intelligence, entity relationships, and publishing decisions.
- **Never used to regenerate or overwrite existing HTML content.**

---

## 🚨 Non-Negotiable System Rules

### ❌ DO NOT EVER
- Delete or overwrite existing `wiki/*.html` article bodies.
- Regenerate full HTML pages from JSON or SAM memory.
- Reintroduce `../` relative paths.
- Modify canonical navigation or layout structures.
- Promote redirect alias pages (e.g., `the-hodl-warriors.html`).
- Alter CI or publisher behavior without explicit instruction.

### ✅ ALWAYS
- Preserve existing article content (source of truth).
- Use **root-relative paths** (`/css/`, `/js/`, `/img/`, `/wiki/...`).
- Maintain **canonical internal links** (`/wiki/{slug}.html`).
- Treat JSON and SAM memory as **metadata only**.
- Validate all changes through CI before merging.

---

## 🧠 System Overview

### 1. Content Layer (Source of Truth)
```
/wiki/*.html
/about.html
/index.html
```
- Contains full article bodies.
- Never auto-generated or overwritten.
- Canonical source for all knowledge.

### 2. Metadata & Intelligence Layer
```
/js/*.json
/api/*.json
```
Used for ranking, knowledge graph relationships, editorial intelligence, and predictive growth.
Not used for full page generation.

### 3. Build & Index Layer
Key scripts:
```
scripts/generate-wiki-index.js
scripts/generate-entity-map.js
scripts/generate-sitemap.js
scripts/generate-site-stats.js
scripts/validate-generated-assets.js
scripts/smoke-test.js
```
These scripts **extract signals from HTML** and build deterministic JSON assets.

### 4. Autonomous Editorial Engine
```
.github/workflows/autonomous-editorial.yml
```
Runs daily to apply stub promotions, expand content hubs, generate intelligence layers, and commit deterministic updates.

---

## ⚙️ Backend: Cloudflare Workers

Two separate Cloudflare Workers power the live backend.

### `moonboys-api` — Engagement & Community Worker
**Deploy path:** `workers/moonboys-api/`
**Live URL:** `https://moonboys-api.sercullen.workers.dev`
**Frontend config:** `js/api-config.js` — `BASE_URL`

**Handles:**
| Endpoint | Purpose |
|----------|---------|
| `GET/POST /comments` | Article comments (D1-backed, SHA-256 email hash for Gravatar) |
| `POST /comments/:id/vote` | Comment up/down votes |
| `GET /comments/recent` | Recent comments feed |
| `GET/POST /likes` | Page likes |
| `GET/POST /citation-votes` | Citation source up/down votes |
| `GET /feed` | Blended activity feed (comments + likes) |
| `GET /leaderboard` | Top contributors by comment count (with `email_hash` for avatars) |
| `GET /activity/hot` | Pages with most recent engagement |
| `GET /health` | Health check |
| `GET /sam/status` | SAM agent status widget |
| `POST /telegram/auth` | Telegram Login Widget HMAC verification |
| `POST /telegram/webhook` | Telegram bot command handler |
| `GET /telegram/profile` | User Telegram profile + linked identity |
| `GET /telegram/leaderboard` | Community XP leaderboard |
| `GET /telegram/quests` | Active lore quests |
| `POST /telegram/link` | Link Telegram identity to wiki email |
| `GET /telegram/activity` | Telegram XP activity feed |
| `GET /telegram/daily-status` | Daily XP claim status |
| `GET /telegram/season/current` | Current community season info |

**Storage:** D1 database `wikicoms` (binding: `DB`)
**Secrets required:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`

---

### `moonboys-leaderboard` — Arcade Score Worker
**Deploy path:** `workers/leaderboard/` (entry: `workers/leaderboard-worker.js`)
**Live URL:** `https://moonboys-leaderboard.sercullen.workers.dev`
**Frontend config:** `js/leaderboard-client.js` — `PRODUCTION_LEADERBOARD_URL`

**Handles:**
| Operation | Purpose |
|-----------|---------|
| `POST /` with `{player, score, game}` | Submit a game score |
| `GET /?game=<key>` | Fetch one leaderboard board |
| `GET /?game=all` | Fetch all boards in one request |

**Board types:** `global` (all-time aggregate), `seasonal` (90-day), `yearly`, `all-time` (top 420, never resets), plus per-game boards for all 8 games.

**Storage:**
- **KV** (`LEADERBOARD` binding): live leaderboard boards, season metadata, archives (primary store for performance)
- **D1** (`DB` binding, `wikicoms`): present for future player identity linking; arcade scores currently live entirely in KV

**Score logic:**
- `main_score = Σ(best per-game scores) + 500 variety_bonus (all 8 games played)`
- Resets: seasonal (every 90 days) and yearly (New Year UTC) are lazy-checked on every request
- Seasonal finalists feed the permanent all-time top 420 board

---

## ⚔️ Battle Chamber (`/community.html`)

The Battle Chamber is the community hub. It is wired to `moonboys-api` via `js/battle-layer.js` and loads live data on page load:

| Section | Source |
|---------|--------|
| Top Contributors (leaderboard) | `GET /leaderboard` — ranked by comment count, Gravatar avatars from `email_hash` |
| Live Activity Feed | `GET /feed` — blended comments + likes |
| Engagement Snapshot | `GET /activity/hot` — most-engaged wiki pages |
| Telegram XP Leaderboard | `GET /telegram/leaderboard` (via `telegram-community.js`) |
| Lore Quests | `GET /telegram/quests` (via `telegram-community.js`) |
| Faction Selector | Local (`localStorage`) — syncs to Telegram profile when linked |
| Daily Missions | Static, local |

---

## 👤 Gravatar / Avatar Flow

Avatars are derived from an SHA-256 hash of the user's lowercase-trimmed email address, stored as `email_hash` in D1. Cloudflare Workers' Web Crypto API supports SHA-256 natively but not MD5 (which Gravatar has historically required). SHA-256 hashes produce valid identicons via Gravatar's `d=identicon` fallback; users with a Gravatar account linked under their MD5 hash will see identicons rather than their profile photo. If Gravatar officially extends SHA-256 support to profile resolution, this will work transparently without any code changes.

**Flow:**
1. User submits a comment with their email address
2. Worker computes `sha256(email.trim().toLowerCase())` — email is never stored or returned by the API
3. `email_hash` is stored in D1 and returned with comment data
4. Frontend builds Gravatar URL: `https://www.gravatar.com/avatar/{email_hash}?s={size}&d=identicon`
5. Gravatar returns an identicon (deterministic per hash — always consistent for that user)
6. Telegram `avatar_url` (from Telegram Login Widget) takes priority when present, bypassing Gravatar entirely

**Avatar priority order:** `avatar_url` (Telegram/explicit) → Gravatar URL (email hash → identicon or real photo) → identicon fallback

**Used in:** article comments (`js/comments.js`), community contributor leaderboard (`js/battle-layer.js`), Telegram community panels (`js/telegram-community.js`)

---

## 🎮 Frontend Config Point

**`js/api-config.js`** is the single place to configure all live API endpoints and feature flags.

```js
window.MOONBOYS_API = {
  BASE_URL: 'https://moonboys-api.sercullen.workers.dev', // engagement API
  FEATURES: { COMMENTS: true, LIKES: true, LEADERBOARD: true, ... },
  TELEGRAM_BOT_USERNAME: null, // set to enable Telegram Login Widget
  GRAVATAR: { BASE, DEFAULT, SIZE, RATING }
};
```

When `BASE_URL` is `null`, all engagement features gracefully degrade to placeholders — nothing breaks.

The arcade leaderboard has its own config in `js/leaderboard-client.js`:
```js
const PRODUCTION_LEADERBOARD_URL = "https://moonboys-leaderboard.sercullen.workers.dev";
```

---

## 🗂️ JS Module Map

| File | Role |
|------|------|
| `js/api-config.js` | Central API config and feature flags |
| `js/engagement.js` | Page like widget + citation vote widgets |
| `js/comments.js` | Article comment section |
| `js/battle-layer.js` | Site-wide battle layer (article battle deck, community nav injection, community page hydration — leaderboard, feed, stats) |
| `js/telegram-community.js` | Telegram XP, quests, profile card, daily claim, activity feed |
| `js/leaderboard-client.js` | Arcade score submission + leaderboard fetch (points at `moonboys-leaderboard` worker) |
| `js/arcade-sync.js` | Local arcade identity (localStorage player name + high scores) |
| `js/arcade-leaderboard.js` | Arcade leaderboard UI (tabs, table, row select) |
| `js/arcade-graph.js` | Arcade score breakdown graph (Canvas 2D) |
| `js/bonus-engine.js` | WTF hidden bonus engine |

---

## 🕹️ Moonboys Arcade

A browser-native, zero-install gaming layer served directly from GitHub Pages.

### Games
| Game | Path | Key |
|------|------|-----|
| 🐍 SnakeRun 3008 | `/games/snake.html` | `snake` |
| 🧩 Crystal Quest | `/games/crystal-quest.html` | `crystal` |
| 🧱 Block Topia Quest Maze | `/games/block-topia-quest-maze.html` | `blocktopia` |
| 👾 Invaders 3008 | `/games/invaders-3008.html` | `invaders` |
| 🟡 Pac-Chain | `/games/pac-chain.html` | `pacchain` |
| 🌑 Asteroid Fork | `/games/asteroid-fork.html` | `asteroids` |
| 🧱 Breakout Bullrun | `/games/breakout-bullrun.html` | `breakout` |
| 🟦 Tetris Block Topia | `/games/tetris-block-topia.html` | `tetris` |

### Arcade Architecture
- **Identity:** `js/arcade-sync.js` — localStorage player name (random fallback, no login required)
- **Score submission:** `js/leaderboard-client.js` → `POST https://moonboys-leaderboard.sercullen.workers.dev`
- **Leaderboard display:** `/games/leaderboard.html` — tabbed UI with seasonal/yearly/all-time + graph
- **Bonus engine:** `js/bonus-engine.js` loads `games/data/hidden_bonus_pool.json`
- **Future identity:** Telegram-linked identity can override local player name without breaking the game flow (arcade-sync will accept a name set by the Telegram auth callback)

### Deployment
```
# Arcade worker
cd workers/leaderboard
wrangler deploy
```

---

## 📊 Phase Breakdown — System Evolution

### 🔹 Phase 1 — Knowledge Graph & Visualization
- Interactive **Graph** (`/graph.html`)
- **Dashboard** (`/dashboard.html`) with cluster health and authority insights

### 🔹 Phase 2 — Deterministic Ranking & Entity Mapping
- Canonical ranking signals embedded in `wiki-index.json`
- Entity relationships formalized in `entity-map.json`

### 🔹 Phase 3 — Stub Integrity & Canonicalization
- Correct isolation of stub pages using `data-wiki-stub="true"`
- Real content pages cleaned of incorrect stub markers

### 🔹 Phase 4 — Autonomous Editorial Operations
- Stub promotion engine (`apply-stub-promotions.js`)
- External intelligence ingestion, hub reinforcement, editorial changelog

### 🔹 Phase 5 — Authority, Trust & Timeline Intelligence
- Authority and trust scoring, narrative chronology
- API-ready intelligence: `api/authority.json`, `api/timeline.json`

### 🔹 Phase 6 — Predictive Intelligence & Governance
- Predictive content expansion, governance prioritization
- API: `api/predictive-growth.json`, `api/governance.json`, `api/publishing.json`

### 🔹 Phase 7 — Community Engagement Layer
- Battle Chamber (`/community.html`) — live contributor leaderboard, activity feed, engagement stats
- Site-wide battle layer (`js/battle-layer.js`) — article battle deck, faction selector, community nav
- Comments, likes, citation votes on all wiki articles via `moonboys-api`
- Telegram community XP / quests / profile integration
- Gravatar/avatar flow for all comment identities
- Two-worker split: engagement API (`moonboys-api`) + arcade leaderboard (`moonboys-leaderboard`)

---

## 🛠️ Local Development

```bash
npm install
node scripts/generate-wiki-index.js
node scripts/generate-entity-map.js
node scripts/generate-sitemap.js
node scripts/generate-site-stats.js
node scripts/validate-generated-assets.js
node scripts/smoke-test.js
```

### Worker Deployment
```bash
# Engagement API
cd workers/moonboys-api
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_BOT_USERNAME
wrangler deploy

# Arcade leaderboard
cd workers/leaderboard
wrangler deploy
```

---

## 📁 Key Directories

| Directory | Purpose |
|-----------|---------|
| `/wiki/` | Canonical article content |
| `/js/` | Generated intelligence, metadata, and frontend modules |
| `/api/` | API-ready mirrors of intelligence layers |
| `/scripts/` | Deterministic build and editorial logic |
| `/workers/moonboys-api/` | Engagement + community + Telegram Cloudflare Worker |
| `/workers/leaderboard/` | Arcade score Cloudflare Worker (entry: `workers/leaderboard-worker.js`) |
| `/games/` | Moonboys Arcade games |
| `/.github/workflows/` | CI/CD automation |
| `/snapshots/` | Historical ranking and intelligence data |
| `/docs/` | Architecture and environment documentation |

---

## 📊 Current System Status

| Category | Status |
|----------|--------|
| Multi-repo architecture | ✅ Operational |
| Deterministic ranking | ✅ Implemented |
| Knowledge graph | ✅ Integrated |
| Autonomous editorial engine | ✅ Active |
| Stub integrity | ✅ Enforced |
| Phase 5/6 intelligence | ✅ Validated |
| Engagement API (`moonboys-api`) | ✅ Deployed |
| Arcade leaderboard (`moonboys-leaderboard`) | ✅ Deployed |
| Battle Chamber / community page | ✅ Live with API hydration |
| Gravatar / avatar flow | ✅ SHA-256 hash, identicon fallback |
| Telegram community XP layer | ✅ Worker routes + frontend widgets present |

---

## ⚠️ Future Agent Warning

If you are an automated agent:

**STOP** if you are about to:
- Regenerate HTML from JSON.
- Simplify or refactor page structures.
- Remove or overwrite article content.
- Modify canonical navigation.
- Promote redirect alias pages.
- Change worker route contracts without updating both the worker AND all frontend callers.

**SAFE** improvements:
- Enhance metadata and intelligence layers.
- Add new wiki articles.
- Improve ranking or search.
- Expand lore and narrative depth.
- Add new worker routes (do not remove or rename existing ones).

---

## 📜 License

MIT License © 2026 Crypto Moonboys 🚀

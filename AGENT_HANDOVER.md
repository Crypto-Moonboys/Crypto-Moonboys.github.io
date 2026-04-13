# 🤖 Agent Handover — Crypto Moonboys Wiki

## 📌 Repository Status

**Version:** v2.1.0
**Status:** Stable, Production-Ready — Phase 7 Telegram/Arcade Layer Live
**Architecture:** Multi-Repository Autonomous Editorial System

---

## 🏗️ Multi-Repository Architecture

| Repository | Role | Description |
|-----------|------|-------------|
| **Frontend / Publisher** | 🌐 Public Wiki | `Crypto-Moonboys.github.io` — Hosts all static HTML, UI, arcade games, and generated JSON intelligence layers via GitHub Pages. |
| **Brain / Intelligence Engine** | 🧠 AI Orchestrator | `HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE` — SAM AI agent, canonical memory, autonomous editorial logic. |
| **Lorewars Integration** | ⚔️ Cross-Platform Agents | `HODLKONG64/lorewars` — Cross-platform narrative and intelligence expansion. |

### 🧠 SAM Memory
- Canonical shared memory stored in **Cloudflare R2** as `sam-memory.json`.
- Used for intelligence, relationships, and publishing decisions.
- **Never used to regenerate or overwrite existing HTML article content.**

---

## 🧠 Core Systems

### 1. Content Layer (Source of Truth)
```
/wiki/*.html
/index.html
/about.html
/categories/
```
- Contains full article bodies. Canonical; never overwrite.
- Redirect alias pages must remain `noindex`.

### 2. Intelligence & Metadata Layer
```
/js/*.json   /api/*.json
```
Phase 1–6 assets: `wiki-index.json`, `entity-map.json`, `entity-graph.json`, `link-graph.json`, `link-map.json`, `content-gaps.json`, `expansion-plan.json`, `growth-priority.json`, `site-stats.json`, `authority-trust.json`, `timeline-intelligence.json`, `predictive-growth.json`, `governance-signals.json`, `publishing-readiness.json`.

These are metadata only. Not used for full page generation.

### 3. Knowledge Graph System
`entity-graph.json` (~37 MB): canonical relationship dataset. Workflows use `NODE_OPTIONS=--max-old-space-size=4096`.

### 4. Autonomous Editorial Workflow
```
.github/workflows/autonomous-editorial.yml
```
Validation order: Phase 1–4 generators → Phase 5 → Phase 6 → `validate-generated-assets.js` → `smoke-test.js`.

---

## ⚙️ Backend: Cloudflare Workers

Three separate Cloudflare Workers power the live backend.

### `moonboys-api` — Engagement & Community Worker
**Deploy path:** `workers/moonboys-api/`
**Live URL:** `https://moonboys-api.sercullen.workers.dev`
**D1 binding:** `DB` → database `wikicoms`
**Secrets:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `ADMIN_TELEGRAM_IDS`, `ADMIN_SECRET`, `ANTI_CHEAT_WORKER_URL`

**Live routes:**
- `GET /health` — health check
- `GET /sam/status` — SAM agent status
- `POST /telegram/auth` — Telegram Login Widget HMAC verification
- `POST /telegram/webhook` — bot command handler (see GK commands below)
- `GET /telegram/profile?telegram_id=` — user profile + faction
- `GET /telegram/leaderboard?limit=` — community XP leaderboard (current season)
- `GET /telegram/quests` — active lore quests
- `POST /telegram/link` — generate one-time /gklink token (15-min TTL); checks is_blocked
- `GET /telegram/link/confirm?token=` — validate and consume one-time token
- `GET /telegram/activity?limit=` — Telegram XP activity feed
- `GET /telegram/daily-status?telegram_id=` — daily XP claim status
- `GET /telegram/season/current` — current season info
- `GET /telegram/user/status?telegram_id=` — user status including anti-cheat state (`anticheat.is_blocked`)

**Pending routes** (not yet provisioned — feature flags set to `false`):
`/comments`, `/likes`, `/citation-votes`, `/feed`, `/leaderboard`, `/activity/hot`

#### Telegram Bot `/gk*` Commands
| Command | Alias | Description |
|---------|-------|-------------|
| `/gkstart` | `/start` | Register + award first-launch XP (50 XP, once). Sends inline keyboard with "Open Incubator Guide" and "Open Battle Chamber" buttons. |
| `/gkhelp` | `/help` | Full command list. Sends inline keyboard with "Open Incubator Guide". |
| `/gklink` | `/link` | Generate one-time link token; sends `community.html?gklink=<token>` link. |
| `/gkstatus` | — | Lifetime, seasonal, and yearly XP + faction + link status |
| `/gkseason` | — | Current season number and days remaining |
| `/gkleaderboard` | — | Top 10 community XP holders |
| `/gkquests` | — | Active lore missions |
| `/gkfaction [name]` | — | View or join faction |
| `/gkunlink` | — | Invalidate link tokens |
| `/daily` | — | Claim daily XP (20 XP/day) |
| `/gkban` | — | Admin: block a user (requires `ADMIN_TELEGRAM_IDS`) |
| `/gkunban` | — | Admin: unblock a user |
| `/gkrisk` | — | Admin: check anti-cheat risk status |
| `/gkclearstrikes` | — | Admin: clear anti-cheat strikes |

#### `/gklink` — Telegram ↔ Website Link Flow
1. User sends `/gklink` → worker generates UUID token (15-min TTL) in `telegram_link_tokens`
2. Bot replies with deep-link: `community.html?gklink=<token>`
3. Browser opens `community.html`; `telegram-community.js` detects `?gklink=` and calls `GET /telegram/link/confirm?token=`
4. Worker validates (single-use, expiry), marks token used, returns `telegram_id`
5. Frontend stores `moonboys_tg_linked = 1` in `localStorage`; competitive features unlock

### `moonboys-anti-cheat` — Anti-Cheat Worker
**Deploy path:** `workers/anti-cheat/`
**Live URL:** `https://moonboys-anti-cheat.sercullen.workers.dev`
**D1 binding:** `DB` → `telegram_anticheat_state` table in `wikicoms`
**Secrets:** `ADMIN_SECRET` (must match `ADMIN_SECRET` in moonboys-api)

Used by `moonboys-api` to block/unblock users and read risk state for admin bot commands.
`GET /telegram/user/status` in moonboys-api reads `telegram_anticheat_state.is_blocked` from D1 directly.

### `moonboys-leaderboard` — Arcade Score Worker
**Deploy path:** `workers/leaderboard/` (entry: `workers/leaderboard-worker.js`)
**Live URL:** `https://moonboys-leaderboard.sercullen.workers.dev`
**KV binding:** `LEADERBOARD`
**D1 binding:** `DB` → `wikicoms` (identity linking, future use)

Boards: `global` (all-time aggregate), `seasonal` (90-day), `yearly`, `all-time` (top 420), plus per-game boards for all 8 games (`snake`, `crystal`, `blocktopia`, `invaders`, `pacchain`, `asteroids`, `breakout`, `tetris`). Variety bonus: +500 XP when all 8 games have scores.

---

## ⚔️ Battle Chamber (`/community.html`)

Live Telegram widgets (via `telegram-community.js`): Telegram XP leaderboard, lore quests, activity feed, daily claim, profile card.

Engagement widgets (via `battle-layer.js`, `home-widgets.js`): currently show "coming soon" placeholders because the engagement routes are not yet provisioned. Feature flags `COMMENTS`, `LIKES`, `CITATION_VOTES`, `LIVE_FEED`, `LEADERBOARD`, `ACTIVITY_PANEL` are all `false` in `js/api-config.js`.

---

## 🎮 Moonboys Arcade

8 browser-native games at `/games/`. Each game has Start/Pause/Reset buttons.

**Fullscreen flow (`js/game-fullscreen.js`):**
1. Clicking the page-level "Start" button opens the fullscreen overlay (game does NOT auto-start)
2. Player presses "▶ Start" in the overlay ctrl bar to begin gameplay
3. Keyboard/touch input is ignored by all games until they are running (`if (!running || paused) return`)

**Anti-cheat check in `/telegram/link`:** the competitive link endpoint checks `telegram_anticheat_state.is_blocked` in D1 before processing. Frontend `requireLinkedAccount()` in `identity-gate.js` also calls `GET /telegram/user/status` to check `anticheat.is_blocked` before permitting competitive actions.

---

## 👤 Identity Model

Four tiers: `guest` → `telegram` (Step 1 auth) → `telegram_linked` (Step 2 /gklink done).

localStorage keys: `moonboys_tg_id`, `moonboys_tg_name`, `moonboys_tg_linked`.

`requireLinkedAccount(fn)` in `identity-gate.js`: gates on linked status AND calls `/telegram/user/status` to check anti-cheat block state. If `anticheat.is_blocked === true`, shows a blocked modal instead of calling `fn`.

---

## 🗄️ D1 Migrations

Database: `wikicoms` (binding `DB` in both moonboys-api and moonboys-leaderboard workers).

| Migration | File | Key tables |
|-----------|------|------------|
| 001 | `workers/moonboys-api/schema.sql` | `telegram_users`, `telegram_xp_log`, `telegram_link_tokens`, `telegram_seasons`, `telegram_leaderboard`, `telegram_activity_log`, `telegram_factions`, `telegram_faction_members`, `telegram_quests` |
| 002 | (anti-cheat schema) | `telegram_anticheat_state` |
| 003 | (future engagement tables) | `comments`, `likes`, `citation_votes` (not yet provisioned) |

---

## 🛠️ Worker Deployment

```bash
# moonboys-api
cd workers/moonboys-api
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_BOT_USERNAME
wrangler secret put ADMIN_TELEGRAM_IDS     # comma-sep numeric Telegram user IDs
wrangler secret put ADMIN_SECRET           # must match anti-cheat worker's ADMIN_SECRET
wrangler secret put ANTI_CHEAT_WORKER_URL  # https://moonboys-anti-cheat.sercullen.workers.dev
wrangler deploy

# moonboys-anti-cheat
cd workers/anti-cheat
wrangler secret put ADMIN_SECRET
wrangler deploy

# moonboys-leaderboard
cd workers/leaderboard
wrangler deploy
```

---

## 🚫 Actions Future Agents Must NOT Perform
- Regenerate HTML articles from JSON.
- Delete or overwrite existing `wiki/*.html` content.
- Introduce randomness into generation.
- Modify canonical navigation structures.
- Promote redirect alias pages.
- Manually edit generated JSON assets.
- Change worker route contracts without updating both worker AND all frontend callers.
- Set engagement feature flags to `true` before the corresponding D1 tables are provisioned.

## ✅ Safe Improvements
- Add new wiki articles.
- Improve ranking, search, or metadata intelligence.
- Expand lore and narrative depth.
- Add new worker routes (do not remove or rename existing ones).
- Add new D1 migrations for planned engagement tables.
- Improve game pages (fullscreen shell, scoring, visuals).

---

## 📊 Final Status

| Category | Status |
|----------|--------|
| Multi-repo architecture | ✅ Operational |
| Phases 1–6 | ✅ Implemented |
| Telegram sync + /gk* commands | ✅ Live |
| Battle Chamber | ✅ Live (Telegram widgets; engagement routes pending) |
| Anti-cheat worker | ✅ Deployed |
| Leaderboard worker | ✅ Deployed |
| moonboys-api worker | ✅ Deployed |
| Migrations 001/002 | ✅ Applied to `wikicoms` D1 |
| Migration 003 (engagement tables) | 🔲 Planned |
| Gravatar / avatar flow | ✅ SHA-256 hash, identicon fallback |
| Arcade fullscreen START button | ✅ Explicit START required in overlay |


---

## 🏗️ Multi-Repository Architecture

| Repository | Role | Description |
|-----------|------|-------------|
| **Frontend / Publisher** | 🌐 Public Wiki | `Crypto-Moonboys.github.io` — Hosts all static HTML pages and generated intelligence layers served via GitHub Pages. |
| **Brain / Intelligence Engine** | 🧠 AI Orchestrator | `HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE` — Hosts the SAM AI agent, canonical memory, and autonomous publishing logic. |
| **Lorewars Integration** | ⚔️ Cross-Platform Agents | `HODLKONG64/lorewars` — Provides cross-platform narrative and intelligence expansion for future phases. |

### 🧠 SAM Memory
- Canonical shared memory stored in **Cloudflare R2** as `sam-memory.json`.
- Used for intelligence, relationships, and publishing decisions.
- **Never used to regenerate or overwrite existing HTML article content.**

---

## 🧠 Core Systems

### 1. Content Layer (Source of Truth)
/wiki/*.html
/index.html
/about.html
/categories/


- Contains full article bodies.
- These files are canonical and must never be overwritten by generators.
- Redirect alias pages (e.g., `the-hodl-warriors.html`) are allowed but must remain `noindex`.

---

### 2. Intelligence & Metadata Layer


/js/.json
/api/.json


#### Phase 1–4 Assets
- `wiki-index.json`
- `entity-map.json`
- `entity-graph.json`
- `link-graph.json`
- `link-map.json`
- `content-gaps.json`
- `expansion-plan.json`
- `growth-priority.json`
- `site-stats.json`

#### Phase 5 Assets
- `authority-trust.json`
- `timeline-intelligence.json`

#### Phase 6 Assets
- `predictive-growth.json`
- `governance-signals.json`
- `publishing-readiness.json`

These assets provide deterministic intelligence for ranking, governance, and future expansion.

---

### 3. Knowledge Graph System

- `entity-graph.json` remains the canonical dataset for relationship intelligence.
- Due to its size (~37 MB), workflows now include memory safeguards:

NODE_OPTIONS=--max-old-space-size=4096

- Frontend visualizations may optionally use a lightweight derivative (`entity-graph-lite.json`) for performance.

---

### 4. Autonomous Editorial Workflow

Primary workflow:

.github/workflows/autonomous-editorial.yml

#### Key Features
- Deterministic generation of all intelligence layers.
- Stub promotion and editorial expansion.
- API mirror synchronization.
- Post–Phase 6 validation of generated assets.
- Visibility into optional (`continue-on-error`) steps.
- CI loop prevention and safe auto-commit logic.

#### Validation Order (Updated)
1. Phase 1–4 generators
2. Phase 5 intelligence generation
3. Phase 6 predictive/governance generation
4. **Structural validation** via `validate-generated-assets.js`
5. **Integration checks** via `smoke-test.js`

---

## 📊 Phase Breakdown

### 🔹 Phase 1 — Knowledge Graph & Visualization
- Interactive entity graph (`/graph.html`)
- Editorial dashboard (`/dashboard.html`)
- Cluster health and authority drift analytics

### 🔹 Phase 2 — Deterministic Ranking
- Canonical ranking signals in `wiki-index.json`
- Entity relationships formalized in `entity-map.json`

### 🔹 Phase 3 — Stub Integrity & Canonicalization
- Correct isolation of stub pages using `data-wiki-stub="true"`
- Real pages cleaned of incorrect stub markers
- Redirect alias protection introduced

### 🔹 Phase 4 — Autonomous Editorial Operations
- Stub promotion engine
- External intelligence ingestion
- Hub reinforcement and editorial changelog

### 🔹 Phase 5 — Authority & Timeline Intelligence
- Authority and trust scoring
- Narrative chronology and event mapping
- API-ready intelligence layers

### 🔹 Phase 6 — Predictive Governance & Publishing
- Predictive growth modeling
- Governance prioritization
- Publishing readiness for cross-platform expansion

---

## 🛠️ Pre–Phase 7 Stabilization Fixes

### ✅ Navigation Parity
- `about.html` and `timeline.html` now include:
  - 🌐 Graph (`/graph.html`)
  - 📊 Dashboard (`/dashboard.html`)

### ✅ Redirect Alias Protection
- `apply-stub-promotions.js` skips pages containing:
  ```html
  <meta http-equiv="refresh">

  Prevents accidental promotion of redirect alias pages such as:

/wiki/the-hodl-warriors.html
✅ Structural Validation of Phase 5/6 Outputs

validate-generated-assets.js now validates:

Existence and JSON integrity
Required schema keys (generated_at, schema_version, entries)
Non-empty datasets
✅ Workflow Memory Safeguards
Node.js heap increased to handle large graph assets.
Warning logs emitted when entity-graph.json exceeds safe thresholds.
✅ Fault-Tolerance Visibility
Workflow summary steps expose results of optional generation stages.
🧭 Deterministic Principles
No randomness in generation.
Identical inputs must produce identical outputs.
Generated JSON is authoritative for metadata only.
HTML content remains the canonical source of truth.
Frontend logic must remain synchronized with generated data.
🎨 Canonical Branding

Ensure consistent usage of the following names:

Crypto Moonboys
GraffPUNKS
HODL Wars
HODL Warriors
🔍 SEO & Metadata Standards

All wiki pages must include:

og:title
og:description
og:image
twitter:card
Schema.org Article JSON-LD
Root-relative internal links

Redirect alias pages must include:

<meta name="robots" content="noindex, follow">
<link rel="canonical" href="https://crypto-moonboys.github.io/wiki/{canonical}.html">
🧪 Validation Requirements

Before merging any change:

node scripts/validate-generated-assets.js
node scripts/smoke-test.js

CI failures must block merges.

🚫 Actions Future Agents Must NOT Perform
Regenerate HTML articles from JSON.
Delete or overwrite existing wiki/*.html content.
Introduce randomness into generation.
Modify canonical navigation structures.
Promote redirect alias pages.
Manually edit generated JSON assets.
🧭 Future Opportunities (Phase 7+)
Cross-platform intelligence synchronization (Lorewars integration)
Lightweight graph streaming and visualization
Multilingual lore expansion
Advanced editorial governance dashboards
Timeline-driven narrative navigation
📊 Final Checklist
Task	Status
Multi-repo architecture	✅
Phases 1–6 implemented	✅
Pre–Phase 7 stabilization	✅
Workflow validation updated	✅
Navigation parity achieved	✅
Redirect alias protection	✅
Documentation updated	✅
🎉 Conclusion

The Crypto Moonboys Wiki is now a deterministic, CI-enforced, multi-repository autonomous editorial system. It is stable, scalable, and ready for Phase 7 cross-platform intelligence expansion.

Future enhancements must remain additive and respect the preservation-first architecture established in this release.

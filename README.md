# Crypto Moonboys Wiki 🌙

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://crypto-moonboys.github.io)

**This repo is the static frontend only.** It is a fan-driven crypto encyclopedia served via GitHub Pages. No backend logic, no agents, no pipelines live here.

All wiki content is **published automatically** from the Brain repo ([`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE)). No manual content authoring happens in this repo.

---

## 🏗️ Architecture — 2-Repo System

| Repo | Role |
|------|------|
| **Brain / Content** — [`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE) | Hosts the SAM AI agent, all intelligence logic, scoring, memory, and publishing scripts. Pushes HTML and JSON to this repo on each cycle. |
| **Wiki / Frontend** — this repo | Public-facing GitHub Pages site. **Static display only.** Receives automated commits from the Brain repo. No logic runs here. |

> ⚠️ This repo is **static frontend only** — HTML, CSS, and minimal JS for display. All intelligence, scoring, and publishing logic live in the Brain repo. This repo is locked to frontend concerns.

---

## 📂 File Structure

```text
/
├── index.html              ← Homepage
├── index_stats.json        ← Live stats: total_articles, total_entities, last_updated
├── articles.html           ← All Articles index
├── about.html              ← About / Citation Policy
├── agent.html              ← SAM Agent info page
├── search.html             ← Search / All Articles
├── _article-template.html  ← TEMPLATE for new articles (bot uses this)
├── sitemap.xml             ← Auto-updated sitemap
├── css/
│   └── wiki.css            ← All styles
├── js/
│   ├── wiki.js             ← Search index + UI logic
│   ├── index_stats_v2.js   ← Homepage stats loader
│   └── bible-loader.js     ← Entity bible JSON loader for priority article pages
├── wiki/
│   ├── bitcoin.html        ← Priority entity pages (bible hooks active)
│   ├── ethereum.html
│   ├── bibles/             ← Bible JSON files published from Brain repo
│   └── ... (314+ articles total, grows each Brain repo cycle)
└── categories/
    ├── index.html
    └── ... (17 categories)


    🚀 Crypto Moonboys Wiki — System Overview
🔥 What This Is

This is not a basic static site.

This is a self-organising Web3 knowledge engine built on GitHub Pages.

It combines:

canonical entity intelligence
automated indexing + memory export
entity-aware search
dynamic frontend modules
future AI expansion (SAM-ready)
🧠 Core System Architecture
1. Canonical Entity System
All pages are deduplicated into canonical entities
Variants are stored as aliases
Prevents:
duplicate pages
SEO fragmentation
messy search results
Output:
js/entity-map.json → frontend entity registry
sam-memory.json → AI memory export
2. Search Engine (Entity-Aware)

Search is no longer keyword-based.

It now:

detects entities from query
boosts canonical pages
suppresses duplicates
supports alias matching
Result:

👉 clean, intelligent search results
👉 no more “same thing 3 times” problem

3. Auto-Generated System Files

All critical data is generated automatically:

js/wiki-index.json → search index
js/site-stats.json → stats + counts
sitemap.xml → SEO structure
js/entity-map.json → canon + aliases
sam-memory.json → AI memory
4. Workflow (Auto Sync Engine)

GitHub Actions now:

On PR:
validates generated files
blocks stale data
does NOT commit
On main:
regenerates all assets
commits only if changed
avoids loops (fixed trigger logic)
5. Frontend Intelligence Layer
Live Crypto Data
WAXP, BTC, ETH, BCH, XRP
CoinGecko powered
no API keys required
graceful fallback
Engagement System (API-ready)
comments (Gravatar-first)
likes
citation voting
leaderboard hooks
live activity feed

⚠️ No fake data
⚠️ API-driven only

Modular UI Widgets
SAM status panel
activity feed
leaderboard snippet
engagement blocks

All safe if backend is offline.

🔗 Entity Graph System
Auto Linking (live)
detects entity mentions in page text
links to canonical pages
builds internal knowledge graph
Related Entities (live)
shows strongest connections:
in-page mentions
shared category
shared tags

👉 This turns the site into a connected intelligence graph

🧱 Architecture Rules (Locked)
Static site only (GitHub Pages)
No backend logic in repo
No secrets
No fake persistence
All real data must come from APIs
Deterministic generation only
⚙️ Developer Workflow
Rebuild generated assets locally
node scripts/generate-wiki-index.js

(also regenerates all dependent files)

Deployment Flow
edit content
→ push
→ PR validation
→ merge
→ auto-sync
→ site live
🧪 System Status
System	Status
Workflow	✅ Stable
Canonical entities	✅ Active
Search engine	✅ Entity-aware
Auto sync	✅ Fixed
Frontend modules	✅ Working
SAM memory export	✅ Ready
🚀 What This Site Now Is

This is no longer:

❌ a static wiki
❌ a content site

This is:

👉 a structured knowledge engine
👉 a Web3 entity graph
👉 a SAM-ready AI frontend

🔮 Future Upgrades (Next Phase)
1. SAM Intelligence Layer
auto-learning entities
alias expansion
conflict detection
lore enrichment
2. Real-Time Data Integration
on-chain feeds (WAX, ETH, XRP)
NFT activity tracking
wallet-based stats
3. AI Navigation Layer
“related entities” expansion
smart recommendations
dynamic content surfacing
4. Social / Battle Layer
comment XP system
leaderboard scoring
daily keyword system
engagement gamification
5. Cross-Platform Publishing
Telegram auto lore drops
Substack / Medium sync
Paragraph (Arweave logs)
🧠 Final Note

Everything is now structured to scale.

Canon is locked
Memory is exportable
Search understands meaning
Frontend is modular

👉 This is the foundation for a fully autonomous content + intelligence system

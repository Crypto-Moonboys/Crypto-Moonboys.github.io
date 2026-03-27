# Crypto Moonboys Wiki 🌙

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://crypto-moonboys.github.io)

The public frontend of the **2-repo SAM system**. This site is a fan-driven crypto encyclopedia inspired by Fandom/MediaWiki design — maintained by the SAM AI agent.

All wiki content is **published automatically** from the Brain repo ([`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE)) via `sam-wiki-publisher.py`. No manual content authoring happens in this repo.

---

## 🏗️ Architecture — 2-Repo System

| Repo | Role |
|------|------|
| **Brain / Orchestrator** — [`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE) | SAM Master Agent (`sam-master-agent.py`) crawls, validates, and stores knowledge. `sam-wiki-publisher.py` converts memory into HTML and pushes it here. Also hosts the full intelligence layer (scoring, ranking, memory, focus-plan, leaderboard, keyword-bank, bible data). |
| **Wiki / Frontend** — this repo | Public-facing GitHub Pages site. Static display only. Receives automated commits from the Brain repo on each SAM cycle. |

> ⚠️ This repo contains **no backend logic**. All intelligence, scoring, and memory live in the Brain repo. This repo is static HTML/CSS/JS served via GitHub Pages.

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
│   ├── sam-status.js       ← SAM status panel (focus plan + keyword bank display)
│   └── bible-loader.js     ← Entity bible JSON loader for priority article pages
├── wiki/
│   ├── bitcoin.html        ← Priority entity pages (SAM bible hooks active)
│   ├── ethereum.html
│   ├── bibles/             ← Bible JSON files published by sam-wiki-publisher.py
│   ├── sam-*.html          ← Legacy redirect stubs (see below)
│   └── ... (314+ articles total, grows each SAM cycle)
└── categories/
    ├── index.html
    └── ... (17 categories)

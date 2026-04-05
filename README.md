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


# Crypto Moonboys Wiki 🌙

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://crypto-moonboys.github.io)

Fan-driven crypto encyclopedia. Published via an automated agent pipeline.

---

## 🏗️ Architecture

| Repo | Role |
|------|------|
| **Brain / Orchestrator** | Crawls, validates, and stores knowledge. Publisher converts memory into HTML and pushes here. |
| **Wiki / Frontend** — this repo | Public-facing GitHub Pages site. Receives automated commits from the brain pipeline. |

Pipeline: **brain → memory → publisher → wiki → telegram**

---

## 📂 File Structure

```
/
├── index.html              ← Homepage
├── index_stats.json        ← Live stats: total_articles, total_entities, last_updated
├── articles.html           ← All Articles index
├── about.html              ← About / Citation Policy
├── agent.html              ← Publishing agent info page
├── search.html             ← Search / All Articles
├── _article-template.html  ← TEMPLATE for new articles
├── brain-rules.md          ← Wiki publishing rules
├── sitemap.xml             ← Auto-updated sitemap
├── css/
│   └── wiki.css            ← All styles
├── js/
│   ├── wiki.js             ← Search index + UI logic
│   └── index_stats_v2.js   ← Stats loader
├── wiki/
│   ├── bitcoin.html        ← Priority entity pages
│   ├── ethereum.html
│   └── ... (articles)
└── categories/
    ├── index.html
    └── ... (categories)
```

---

## 🔄 How Publishing Works

1. Brain agent crawls sources, validates facts, stores memory.
2. Publisher reads memory, generates HTML, pushes commits here.
3. Each new article updates `articles.html`, category pages, `js/wiki.js`, and `sitemap.xml`.
4. GitHub Pages serves at [crypto-moonboys.github.io](https://crypto-moonboys.github.io).

---

## 📖 SAM Bible System

The intelligence layer exposes `/bibles/{entity_name}`. Top priority pages are wired with:

- `data-entity-slug` on `<article>` — identifies the entity
- `<div id="bible-content"></div>` before `</article>` — injection target

**Hooked pages:** `bitcoin`, `ethereum`, `nfts`, `defi`, `graffpunks`, `hodl-wars`, `crypto-moonboys`, `blockchain`, `waxp`, `xrpl`

---

## 📖 Publishing Rules

Full rules live in [`brain-rules.md`](brain-rules.md). New articles use descriptive slugs only — no legacy prefixes.

---

## Design

- Dark theme · Gold accent (`#f7c948`) · Responsive · Vanilla JS only

## License

Fan content — not for commercial use. **Not financial advice.**

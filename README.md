# Crypto Moonboys Wiki 🌙

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://crypto-moonboys.github.io)

The public frontend of the **3-repo SAM system**. This site is a fan-driven crypto encyclopedia inspired by Fandom/MediaWiki design — maintained by the SAM AI agent.

All wiki content is **published automatically** from the Brain repo ([`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE)) via `sam-wiki-publisher.py`. No manual content authoring happens in this repo.

---

## 🏗️ Architecture — 3-Repo System

| Repo | Role |
|------|------|
| **Brain / Orchestrator** — [`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE) | SAM Master Agent (`sam-master-agent.py`) crawls, validates, and stores knowledge. `sam-wiki-publisher.py` converts memory into HTML and pushes it here. |
| **Intelligence / Backend** — [`HODLKONG64/sam-v2-intelligence`](https://github.com/HODLKONG64/sam-v2-intelligence) | SAM v2 Python + FastAPI layer. Scoring, ranking, memory, focus-plan, leaderboard, keyword-bank, and bible endpoints. |
| **Wiki / Frontend** — this repo | Public-facing GitHub Pages site. Serves 314 articles · 158 entities. Receives automated commits from the Brain repo on each SAM cycle. |

---

## 📂 File Structure

```
/
├── index.html              ← Homepage
├── index_stats.json        ← Live stats: total_articles, total_entities, last_updated
├── articles.html           ← All Articles index
├── about.html              ← About / Citation Policy
├── agent.html              ← SAM Agent info page
├── search.html             ← Search / All Articles
├── _article-template.html  ← TEMPLATE for new articles (bot uses this)
├── brain-rules.md          ← Wiki-specific publishing rules (subset)
├── sitemap.xml             ← Auto-updated sitemap
├── css/
│   └── wiki.css            ← All styles
├── js/
│   ├── wiki.js             ← Search index + UI logic
│   ├── index_stats.js      ← Homepage stats loader
│   └── index_stats_v2.js   ← Stats loader v2
├── wiki/
│   ├── bitcoin.html        ← Priority entity pages (SAM bible hooks active)
│   ├── ethereum.html
│   ├── sam-*.html          ← Legacy redirect stubs (see below)
│   └── ... (314 articles total)
└── categories/
    ├── index.html
    └── ... (17 categories)
```

---

## 🔄 How Publishing Works

1. `sam-master-agent.py` crawls sources, validates facts, stores memory in Cloudflare R2.
2. `sam-wiki-publisher.py` reads memory, generates HTML, pushes commits here.
3. Each new article updates `articles.html`, category pages, `js/wiki.js`, and `sitemap.xml`.
4. GitHub Pages serves at [crypto-moonboys.github.io](https://crypto-moonboys.github.io).

---

## 📖 SAM Bible System

The SAM v2 intelligence layer exposes `/bibles/{entity_name}`. Top 10 priority pages are wired with:

- `data-entity-slug` on `<article>` — identifies the entity
- `<div id="bible-content"></div>` before `</article>` — injection target

**Hooked pages:** `bitcoin`, `ethereum`, `nfts`, `defi`, `graffpunks`, `hodl-wars`, `crypto-moonboys`, `blockchain`, `waxp`, `xrpl`

---

## 🔀 Legacy Redirect Stubs

- **`sam.html`** → `agent.html`
- **`categories/sam-generated.html`** → `categories/lore.html`
- **`wiki/sam-*.html`** → canonical non-prefixed URLs

Per DB-47, SAM no longer creates `sam-` prefixed slugs.

---

## 📖 Brain Rules

Full canonical rules (DB-1 through DB-48) live in the Brain repo:
👉 [`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE/brain-rules.md`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE/blob/main/brain-rules.md)

---

## Design

- Dark theme · Gold accent (`#f7c948`) · Responsive · Vanilla JS only

## License

Fan content — not for commercial use. **Not financial advice.**

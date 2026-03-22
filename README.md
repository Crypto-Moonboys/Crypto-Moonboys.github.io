# Crypto Moonboys Wiki 🌙

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://crypto-moonboys.github.io)

The public frontend of the **2-repo SAM system**. This site is a fan-driven crypto encyclopedia inspired by Fandom/MediaWiki design — maintained exclusively by the SAM AI agent.

All wiki content is **published automatically** from the Brain repo ([`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE)) via `sam-wiki-publisher.py`. No manual content authoring happens in this repo.

---

## 🏗️ Architecture — 2-Repo System

| Repo | Role |
|------|------|
| **Brain** — [`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE) | SAM Master Agent (`sam-master-agent.py`) crawls, validates, and stores knowledge. `sam-wiki-publisher.py` converts memory into HTML and pushes it here. |
| **Wiki** — this repo | Public-facing GitHub Pages site. Serves 130+ articles across 17 categories. Receives automated commits from the Brain repo on each SAM cycle. |

---

## 📂 File Structure

```
/
├── index.html              ← Homepage
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
│   └── wiki.js             ← Search index + UI logic
├── img/
│   ├── logo.svg
│   └── favicon.svg
├── wiki/
│   ├── bitcoin.html        ← OG hand-authored articles
│   ├── ethereum.html
│   ├── sam-*.html          ← Legacy redirect stubs (see below)
│   └── ... (130+ articles total)
└── categories/
    ├── index.html
    └── ... (17 categories)
```

---

## 🔄 How Publishing Works

1. `sam-master-agent.py` (in the Brain repo) crawls sources, validates facts, and stores structured memory in Cloudflare R2.
2. `sam-wiki-publisher.py` (in the Brain repo) reads that memory, generates or updates HTML articles, and pushes commits to this repo.
3. Each new article is registered in `articles.html`, the relevant category page, `js/wiki.js` (`WIKI_INDEX`), and `sitemap.xml`.
4. GitHub Pages serves the result at [crypto-moonboys.github.io](https://crypto-moonboys.github.io).

---

## 🔀 Legacy Redirect Stubs

The following files are **redirect stubs** kept for backwards compatibility — they are not full articles:

- **`sam.html`** → redirects to `agent.html`
- **`categories/sam-generated.html`** → redirects to `categories/lore.html`
- **`wiki/sam-*.html`** (many) → redirect to their canonical non-prefixed URLs (e.g. `wiki/sam-bitcoin-kid-army.html` → `wiki/bitcoin-kid-army.html`)

Per DB-47, SAM no longer creates `sam-` prefixed slugs. These stubs exist so old links don't break.

---

## 📖 Brain Rules

This repo contains a `brain-rules.md` — this is a **wiki-specific publishing/presentation subset** covering page structure, emoji conventions, sidebar registration, cross-linking, and sitemap updates.

The **full canonical rules** (DB-1 through DB-48, the Master Agent Bible) live in the Brain repo:
👉 [`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE/brain-rules.md`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE/blob/main/brain-rules.md)

---

## Design

- Dark theme inspired by Fandom/MediaWiki · Gold accent (`#f7c948`)
- Responsive — mobile sidebar with hamburger
- No JS frameworks — vanilla JS only
- Client-side search powered by `WIKI_INDEX` in `wiki.js`

## License

Fan content — not for commercial use. **Not financial advice.**

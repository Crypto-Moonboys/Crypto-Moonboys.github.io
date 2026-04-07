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


# 🧠 Crypto Moonboys Wiki — SAM Intelligence System

## 🚀 Overview

This is not a standard website.

This is a **self-structuring, data-driven intelligence platform** built on a static architecture — powered by:

* Canonical entity mapping
* Deterministic data pipelines
* Automated indexing
* Search intelligence
* Visual system monitoring (SAM Dashboard)

The system transforms raw wiki pages into a **connected knowledge graph with visible intelligence**.

---

## 🧩 Core Architecture

### 1. Wiki Layer (Content)

* `/wiki/*.html`
* Human-written or generated lore/content pages
* Canonical source of truth for all entities

---

### 2. Index Layer (Search + Discovery)

* `/js/wiki-index.json`
* Generated via:

  ```
  scripts/generate-wiki-index.js
  ```
* Handles:

  * Search indexing
  * Canonical URL structure
  * Deduplication + alias merging

---

### 3. Entity Layer (Intelligence Core)

* `/js/entity-map.json`
* `/sam-memory.json`

Generated via:

```
scripts/generate-entity-map.js
```

Each entity includes:

* canonical_title
* canonical_url
* aliases
* alias_candidates
* tags
* category
* source_urls

👉 This is the **brain structure**

---

### 4. Stats Layer (System State)

* `/js/site-stats.json`

Generated via:

```
scripts/generate-site-stats.js
```

Tracks:

* total_articles
* total_entities
* category_count
* last_updated

👉 Now correctly synced with real data (no mismatches)

---

### 5. SAM Dashboard (Visible Intelligence)

* `/sam.html`

Displays:

* entity rankings
* system stats
* activity feed
* knowledge graph

Powered by:

* entity-map.json
* site-stats.json
* sam-memory.json

👉 Turns system into **visible AI**

---

## 🔄 Data Pipeline (Deterministic)

Full rebuild flow:

```bash
node scripts/generate-wiki-index.js
node scripts/generate-sitemap.js
node scripts/generate-site-stats.js
node scripts/generate-entity-map.js
```

Or:

```bash
node scripts/generate-wiki-index.js && \
node scripts/generate-sitemap.js && \
node scripts/generate-site-stats.js && \
node scripts/generate-entity-map.js
```

---

## 🔍 Search System

* Powered by `wiki-index.json`
* Canonical-only results (no duplicates)
* Fixed:

  * ❌ `/wiki/wiki/...` bug
  * ❌ stale index issues

Auto-sync enabled via:

```
.github/workflows/wiki-index-sync.yml
```

👉 Rebuilds index automatically on commit

---

## 🧠 Entity System (Key Feature)

Every page becomes a structured entity:

* deduplicated via alias matching
* merged into canonical records
* cross-linked via tags

Supports:

* graph visualization
* clustering
* future AI expansion

---

## 📊 System Integrity (LOCKED)

All data now aligned:

| Layer      | Source             | Status |
| ---------- | ------------------ | ------ |
| wiki-index | HTML pages         | ✅      |
| entity-map | wiki-index         | ✅      |
| sam-memory | entity-map         | ✅      |
| site-stats | entity-map + index | ✅      |

No mismatches
No fake counts
No drift

---

## 🧭 Navigation

Global header includes:

* Home
* Categories
* All Articles
* 🧠 SAM Dashboard

Auto-injected across all pages (241+ files)

---

## 🧱 File Structure

```
/wiki/                  → content pages
/js/
  wiki-index.json       → search index
  entity-map.json       → entity registry
  site-stats.json       → system stats
/scripts/
  generate-wiki-index.js
  generate-entity-map.js
  generate-site-stats.js
  generate-sitemap.js
/sam.html               → dashboard
/sam-memory.json        → machine memory
.github/workflows/
  wiki-index-sync.yml   → auto index rebuild
```

---

## ⚙️ Key Fixes Applied

### ✅ Search

* Removed duplicate `/wiki/wiki/` paths
* Rebuilt canonical index

### ✅ Stats

* Fixed `total_entities` (was using category count)
* Now uses real entity-map length

### ✅ Titles

* Converted slug titles:

  * `alfie_blaze` → `Alfie Blaze`
  * `1m_free_nfts` → `1M Free NFTs`

### ✅ Navigation

* Added SAM link globally
* Fixed relative paths per directory depth

### ✅ Automation

* Index rebuild auto-runs on commit
* Prevents stale search results

---

## ⚡ Performance

* Fully static → fast load
* No backend required
* No runtime dependencies
* Lightweight JS only

---

## 🔐 Rules (Do Not Break)

* Never manually edit generated JSON files
* Always run generators after adding pages
* Do not change canonical URLs
* Do not introduce duplicate entities
* Titles must be clean (no underscores)

---

## 🚀 What This System Is

This is:

* a wiki
* a structured data engine
* a search system
* an entity graph
* a visible AI dashboard

Combined into:

👉 **a self-organising intelligence platform**

---

## 🧠 Final State

* Fully operational
* Fully synced
* Fully deterministic

No missing components
No broken systems
No outstanding fixes

---

## 📌 End

This repository is now complete and stable.


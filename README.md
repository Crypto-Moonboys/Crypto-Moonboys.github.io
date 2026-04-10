# Crypto Moonboys Wiki 🌙

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://crypto-moonboys.github.io)

It is a fan-driven crypto encyclopedia served via GitHub Pages.

All wiki content is **published automatically** from the Brain repo ([`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE)). No manual content authoring happens in this repo.

---

## 🏗️ Architecture — 2-Repo System

| Repo | Role |
|------|------|
| **Brain / Content** — [`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE) | Hosts the SAM AI agent, all intelligence logic, scoring, memory, and publishing scripts. 

# 🌙 Crypto Moonboys Wiki — System README (LOCKED BUILD)

## 🚨 READ THIS FIRST (NON-NEGOTIABLE RULES)

This repository is now in a **stable, production-safe state**.

### ❌ DO NOT EVER:

* Delete `wiki/*.html` files in bulk
* Rebuild pages from JSON or SAM memory
* Replace real article bodies with summaries
* Reintroduce `../` relative paths
* Use relative internal links like `bitcoin.html`
* Modify working HTML structure “for cleanup”
* Change publisher behavior without explicit instruction

### ✅ ALWAYS:

* Preserve existing article content
* Use **root-relative paths** (`/css/`, `/js/`, `/wiki/...`)
* Use **canonical internal links** (`/wiki/{slug}.html`)
* Treat SAM memory as **metadata only**
* Validate all changes against CI before merge

👉 This system is **LOCKED**. Changes must be additive, not destructive.

---

# 🧠 SYSTEM OVERVIEW

This is a **static wiki + AI-assisted publishing system**.

It separates **content** from **metadata**, which is the core principle that must never be broken.

## Architecture

### 1. Content Layer (SOURCE OF TRUTH)

```
/wiki/*.html
/about/*.html
```

* Full article bodies live here
* These files are canonical
* Never auto-generated or overwritten

---

### 2. Metadata Layer (SAM / JSON)

Used for:

* ranking
* categories
* tags
* aliases
* mention counts
* indexing

**NOT used for:**

* full page generation

---

### 3. Build / Index Layer

Scripts:

```
scripts/generate-wiki-index.js
scripts/generate-entity-map.js
scripts/generate-sitemap.js
scripts/generate-site-stats.js
scripts/validate-generated-assets.js
```

These:

* read HTML content
* extract signals
* build JSON indexes

👉 They DO NOT create content

---

### 4. Publisher (CONTROLLED GENERATOR)

```
sam-wiki-publisher.py
```

Now behaves as:

* stub generator (only if page missing)
* metadata enhancer
* path normalizer

👉 It must NEVER:

* delete pages
* overwrite real content

---

### 5. CI Enforcement

```
.github/workflows/wiki-index-sync.yml
```

Validates:

* no `../` paths
* correct root-relative structure
* generated assets consistency

Now includes:

```
wiki/
categories/
about/
about.html
```

---

# 🔧 WHAT WAS FIXED (CRITICAL HISTORY)

## Phase 1 — BREAKAGE

* Publisher deleted all `wiki/*.html`
* Rebuilt pages from metadata
* Destroyed real content

## Phase 2 — RESTORE

* Recovered pages from git history
* Reintroduced full article bodies

## Phase 3 — PATH NORMALIZATION

* Removed all `../` paths
* Standardized:

```
/css/
/js/
/img/
/index.html
/search.html
/categories/
```

## Phase 4 — INTERNAL LINK FIX

Replaced:

```
bitcoin.html
```

with:

```
/wiki/bitcoin.html
```

## Phase 5 — SYSTEM HARDENING

* Added path normalization to publisher
* Extended CI to cover `/about/`
* Eliminated all fragile links

---

# 📏 CURRENT SYSTEM RULES

## Paths (STRICT)

| Type       | Format                                           |
| ---------- | ------------------------------------------------ |
| CSS        | `/css/...`                                       |
| JS         | `/js/...`                                        |
| Images     | `/img/...`                                       |
| Wiki pages | `/wiki/{slug}.html`                              |
| Navigation | `/index.html`, `/search.html`, `/categories/...` |

---

## Internal Linking (STRICT)

```html
<a href="/wiki/bitcoin.html">Bitcoin</a>
```

Never:

```html
<a href="bitcoin.html">
<a href="../bitcoin.html">
```

---

## Stub Pages

If generated:

Must include:

```html
<body data-wiki-stub="true">
```

And clearly indicate:

> This is a stub article generated from metadata.

---

# ⚙️ PUBLISHER SAFETY MODEL

The publisher now enforces:

### Preservation-first logic

```
IF page exists AND is full → KEEP
IF page missing → CREATE stub
IF page restored → NORMALIZE paths
```

### Path normalization

All generated/restored content passes through:

```
normalize_legacy_paths()
```

Prevents:

* `../css/`
* `../js/`
* `../img/`
* `../articles.html`

---

# 🛡️ CI SAFETY MODEL

CI blocks:

* relative paths
* broken navigation
* outdated structures

If CI fails → DO NOT MERGE

---

# 📊 CURRENT STATUS

* ✅ 0 fragile paths
* ✅ 0 relative internal links
* ✅ 100% root-relative structure
* ✅ publisher safe
* ✅ CI enforced
* ✅ full article content restored

---

# ⚠️ FUTURE AGENT WARNING

If you are an automated agent:

### STOP if you are about to:

* regenerate HTML from JSON
* “simplify” page structure
* refactor navigation paths
* clean “duplicate-looking” files
* remove HTML content

👉 These actions will BREAK the system.

---

# 🚀 SAFE FUTURE IMPROVEMENTS

Allowed:

* improve ranking (JSON layer only)
* add new articles
* enhance metadata
* expand lore content
* improve search/indexing

NOT allowed:

* altering content generation model
* destructive rebuild logic

---

# 🧭 FINAL NOTE

This repo is no longer experimental.

It is a:

> **deterministic, CI-enforced, preservation-first publishing system**

Respect that — or you will break it again.

# 🌙 Crypto Moonboys Wiki

![Version](https://img.shields.io/badge/version-v1.0.0-blue)
![Status](https://img.shields.io/badge/status-stable-brightgreen)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

## 🚀 Autonomous Lore Engine

The Crypto Moonboys Wiki is a deterministic, self-evolving lore ecosystem powered by knowledge graph intelligence and automated content expansion. This repository represents the first stable release (**v1.0.0**) of the platform.

## 📦 Release Information

**Current Version:** v1.0.0  
**Status:** Stable  
**Release Date:** 2026  

This milestone marks the completion of the multi-phase stabilization and enhancement of the repository, including:

- Knowledge graph integration
- Deterministic ranking system
- Cluster hub generation
- Related pages UI
- Growth priority engine
- SEO and accessibility compliance
- Final repository-wide sanity audit

---

## 🌐 Phase 1 Upgrades — Graph Visualization & Editorial Intelligence

The following features were added as part of Phase 1 (April 2026). All are additive and operate through the JSON metadata layer without touching any `wiki/*.html` content.

### New Pages

| Page | Description |
|------|-------------|
| [`/graph.html`](https://crypto-moonboys.github.io/graph.html) | Interactive force-directed entity relationship graph (Canvas 2D). Pan, zoom, drag, filter by category, search by name. |
| [`/dashboard.html`](https://crypto-moonboys.github.io/dashboard.html) | Editorial intelligence dashboard: cluster health, content gaps, authority drift alerts, entity changelog, growth priorities. |

### New Data Generators

All scripts are deterministic and idempotent. Run them in any order after the core generators.

| Script | Output | Description |
|--------|--------|-------------|
| `scripts/generate-graph-data.js` | `js/graph-data.json` | Derives nodes + edges from `entity-graph.json` (top-5 edges per source, score ≥ 40). |
| `scripts/generate-cluster-health.js` | `js/cluster-health.json` | Computes per-cluster health scores (avg links, rank, authority, centrality, content depth). |
| `scripts/generate-authority-drift.js` | `js/authority-drift.json` | Compares `wiki-index.json` authority scores against entity-graph in-degree centrality. Emits `high`/`medium`/`ok` alert levels. |
| `scripts/generate-entity-changelog.js` | `js/entity-changelog.json` | Diffs `snapshots/ranking-*.json` to track per-entity rank score changes over time. |

### Running Phase 1 Generators

```bash
# Core generators (run first)
node scripts/generate-wiki-index.js
node scripts/generate-entity-map.js
node scripts/generate-site-stats.js
node scripts/generate-entity-graph.js

# Phase 1 generators
node scripts/generate-graph-data.js
node scripts/generate-cluster-health.js
node scripts/generate-authority-drift.js
node scripts/generate-entity-changelog.js

# Validation
node scripts/validate-generated-assets.js
node scripts/smoke-test.js
```

All Phase 1 generators are integrated into the CI workflow (`wiki-index-sync.yml`) and run with `continue-on-error: true` so they never block core validation.

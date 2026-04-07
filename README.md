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

---

END OF FILE
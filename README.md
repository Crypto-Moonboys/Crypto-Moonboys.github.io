# 🌙 Crypto Moonboys Wiki

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://crypto-moonboys.github.io)
![Version](https://img.shields.io/badge/version-v2.0.0-blue)
![Status](https://img.shields.io/badge/status-stable-brightgreen)
![Architecture](https://img.shields.io/badge/architecture-multi--repo-purple)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

The **Crypto Moonboys Wiki** is a deterministic, self-evolving lore and knowledge ecosystem powered by AI-driven editorial intelligence. It operates as a **multi-repository system**, separating content, intelligence, and publishing to ensure stability, scalability, and long-term maintainability.

🌐 **Live Site:** https://crypto-moonboys.github.io

---

## 🏗️ Multi-Repository Architecture

The platform is built on a **two-repo system**, ensuring a clear separation of responsibilities.

| Repository | Role | Description |
|-----------|------|-------------|
| **Frontend / Publisher** | 🌐 Public Wiki | [`Crypto-Moonboys.github.io`](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io) — Hosts all static HTML content, UI, and generated JSON intelligence layers served via GitHub Pages. |
| **Brain / Intelligence Engine** | 🧠 AI Orchestrator | [`HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`](https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE) — Hosts the SAM AI agent, memory, scoring logic, and autonomous editorial operations. |

### 🧠 SAM Memory
- Canonical shared memory stored in **Cloudflare R2**: `sam-memory.json`
- Used for intelligence, entity relationships, and publishing decisions.
- **Never used to regenerate or overwrite existing HTML content.**

---

## 🚨 Non-Negotiable System Rules

### ❌ DO NOT EVER
- Delete or overwrite existing `wiki/*.html` article bodies.
- Regenerate full HTML pages from JSON or SAM memory.
- Reintroduce `../` relative paths.
- Modify canonical navigation or layout structures.
- Promote redirect alias pages (e.g., `the-hodl-warriors.html`).
- Alter CI or publisher behavior without explicit instruction.

### ✅ ALWAYS
- Preserve existing article content (source of truth).
- Use **root-relative paths** (`/css/`, `/js/`, `/img/`, `/wiki/...`).
- Maintain **canonical internal links** (`/wiki/{slug}.html`).
- Treat JSON and SAM memory as **metadata only**.
- Validate all changes through CI before merging.

---

## 🧠 System Overview

### 1. Content Layer (Source of Truth)
/wiki/*.html
/about.html
/index.html

- Contains full article bodies.
- Never auto-generated or overwritten.
- Canonical source for all knowledge.

### 2. Metadata & Intelligence Layer

/js/.json
/api/.json

Used for:
- Ranking and authority scoring
- Knowledge graph relationships
- Editorial intelligence
- Predictive growth and governance

Not used for:
- Full page generation.

### 3. Build & Index Layer
Key scripts:

scripts/generate-wiki-index.js
scripts/generate-entity-map.js
scripts/generate-sitemap.js
scripts/generate-site-stats.js
scripts/validate-generated-assets.js
scripts/smoke-test.js

These scripts **extract signals from HTML** and build deterministic JSON assets.

### 4. Autonomous Editorial Engine

.github/workflows/autonomous-editorial.yml

Runs daily to:
- Apply stub promotions
- Expand and reinforce content hubs
- Generate intelligence layers
- Publish API-ready outputs
- Commit deterministic updates

---

## 📊 Phase Breakdown — System Evolution

### 🔹 Phase 1 — Knowledge Graph & Visualization
- Interactive **Graph** (`/graph.html`)
- **Dashboard** (`/dashboard.html`) with cluster health and authority insights
- Graph data derived from `entity-graph.json`

### 🔹 Phase 2 — Deterministic Ranking & Entity Mapping
- Canonical ranking signals embedded in `wiki-index.json`
- Entity relationships formalized in `entity-map.json`

### 🔹 Phase 3 — Stub Integrity & Canonicalization
- Correct isolation of stub pages using `data-wiki-stub="true"`
- Real content pages cleaned of incorrect stub markers
- Sitemap and search index exclude stub-only pages

### 🔹 Phase 4 — Autonomous Editorial Operations
- Stub promotion engine (`apply-stub-promotions.js`)
- External intelligence ingestion
- Hub reinforcement and controlled expansion
- Editorial changelog for deterministic history

### 🔹 Phase 5 — Authority, Trust & Timeline Intelligence
Generated assets:
js/authority-trust.json
js/timeline-intelligence.json
api/authority.json
api/timeline.json

Capabilities:
- Authority and trust scoring
- Narrative and event chronology
- API-ready intelligence for external platforms

### 🔹 Phase 6 — Predictive Intelligence & Governance
Generated assets:

js/predictive-growth.json
js/governance-signals.json
js/publishing-readiness.json
api/predictive-growth.json
api/governance.json
api/publishing.json

Capabilities:
- Predictive content expansion
- Governance prioritization
- Cross-platform publishing readiness

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

Prevents accidental promotion of alias pages such as:

/wiki/the-hodl-warriors.html
✅ Structural Validation for Phase 5/6 Outputs
validate-generated-assets.js now validates:
authority-trust.json
timeline-intelligence.json
predictive-growth.json
governance-signals.json
publishing-readiness.json
Ensures required schema and non-empty entries.
✅ Graph Memory Safeguard

Workflows set:

NODE_OPTIONS=--max-old-space-size=4096
Emits warnings if entity-graph.json becomes excessively large.
✅ Fault-Tolerance Visibility
Workflow summary steps ensure that optional (continue-on-error) tasks are visible in CI logs.
📁 Key Directories
Directory	Purpose
/wiki/	Canonical article content
/js/	Generated intelligence and metadata
/api/	API-ready mirrors of intelligence layers
/scripts/	Deterministic build and editorial logic
/.github/workflows/	CI/CD automation
/snapshots/	Historical ranking and intelligence data
🧪 Local Development
Install Dependencies
npm install
Run Generators
node scripts/generate-wiki-index.js
node scripts/generate-entity-map.js
node scripts/generate-sitemap.js
node scripts/generate-site-stats.js
node scripts/generate-graph-data.js
node scripts/generate-authority-trust.js
node scripts/generate-timeline-intelligence.js
node scripts/generate-predictive-growth.js
node scripts/generate-governance-signals.js
node scripts/generate-publishing-readiness.js
Validate the Build
node scripts/validate-generated-assets.js
node scripts/smoke-test.js
📊 Current System Status
Category	Status
Multi-repo architecture	✅ Operational
Deterministic ranking	✅ Implemented
Knowledge graph	✅ Integrated
Autonomous editorial engine	✅ Active
Stub integrity	✅ Enforced
Phase 5/6 intelligence	✅ Validated
Navigation consistency	✅ Fixed
CI safety & determinism	✅ Enforced
⚠️ Future Agent Warning

If you are an automated agent:

STOP if you are about to:
Regenerate HTML from JSON.
Simplify or refactor page structures.
Remove or overwrite article content.
Modify canonical navigation.
Promote redirect alias pages.
SAFE Improvements:
Enhance metadata and intelligence layers.
Add new articles.
Improve ranking or search.
Expand lore and narrative depth.
🧭 Final Note

The Crypto Moonboys Wiki is no longer experimental. It is a:

Deterministic, CI-enforced, preservation-first, multi-repository autonomous editorial system.

Respect the architecture, preserve the content, and build forward—never destructively.

📜 License

MIT License © 2026 Crypto Moonboys 🚀

# 🤖 Agent Handover — Crypto Moonboys Wiki

## 📌 Repository Status

**Version:** v2.0.0  
**Status:** Stable, Production-Ready & Pre–Phase 7 Stabilized  
**Architecture:** Multi-Repository Autonomous Editorial System

This repository represents a deterministic, self-evolving lore ecosystem powered by knowledge graph intelligence and AI-assisted editorial automation. All core systems have been stabilized and validated through Phases 1–6, with additional pre–Phase 7 safeguards implemented.

---

## 🏗️ Multi-Repository Architecture

| Repository | Role | Description |
|-----------|------|-------------|
| **Frontend / Publisher** | 🌐 Public Wiki | `Crypto-Moonboys.github.io` — Hosts all static HTML pages and generated intelligence layers served via GitHub Pages. |
| **Brain / Intelligence Engine** | 🧠 AI Orchestrator | `HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE` — Hosts the SAM AI agent, canonical memory, and autonomous publishing logic. |
| **Lorewars Integration** | ⚔️ Cross-Platform Agents | `HODLKONG64/lorewars` — Provides cross-platform narrative and intelligence expansion for future phases. |

### 🧠 SAM Memory
- Canonical shared memory stored in **Cloudflare R2** as `sam-memory.json`.
- Used for intelligence, relationships, and publishing decisions.
- **Never used to regenerate or overwrite existing HTML article content.**

---

## 🧠 Core Systems

### 1. Content Layer (Source of Truth)
/wiki/*.html
/index.html
/about.html
/categories/


- Contains full article bodies.
- These files are canonical and must never be overwritten by generators.
- Redirect alias pages (e.g., `the-hodl-warriors.html`) are allowed but must remain `noindex`.

---

### 2. Intelligence & Metadata Layer


/js/.json
/api/.json


#### Phase 1–4 Assets
- `wiki-index.json`
- `entity-map.json`
- `entity-graph.json`
- `link-graph.json`
- `link-map.json`
- `content-gaps.json`
- `expansion-plan.json`
- `growth-priority.json`
- `site-stats.json`

#### Phase 5 Assets
- `authority-trust.json`
- `timeline-intelligence.json`

#### Phase 6 Assets
- `predictive-growth.json`
- `governance-signals.json`
- `publishing-readiness.json`

These assets provide deterministic intelligence for ranking, governance, and future expansion.

---

### 3. Knowledge Graph System

- `entity-graph.json` remains the canonical dataset for relationship intelligence.
- Due to its size (~37 MB), workflows now include memory safeguards:

NODE_OPTIONS=--max-old-space-size=4096

- Frontend visualizations may optionally use a lightweight derivative (`entity-graph-lite.json`) for performance.

---

### 4. Autonomous Editorial Workflow

Primary workflow:

.github/workflows/autonomous-editorial.yml

#### Key Features
- Deterministic generation of all intelligence layers.
- Stub promotion and editorial expansion.
- API mirror synchronization.
- Post–Phase 6 validation of generated assets.
- Visibility into optional (`continue-on-error`) steps.
- CI loop prevention and safe auto-commit logic.

#### Validation Order (Updated)
1. Phase 1–4 generators
2. Phase 5 intelligence generation
3. Phase 6 predictive/governance generation
4. **Structural validation** via `validate-generated-assets.js`
5. **Integration checks** via `smoke-test.js`

---

## 📊 Phase Breakdown

### 🔹 Phase 1 — Knowledge Graph & Visualization
- Interactive entity graph (`/graph.html`)
- Editorial dashboard (`/dashboard.html`)
- Cluster health and authority drift analytics

### 🔹 Phase 2 — Deterministic Ranking
- Canonical ranking signals in `wiki-index.json`
- Entity relationships formalized in `entity-map.json`

### 🔹 Phase 3 — Stub Integrity & Canonicalization
- Correct isolation of stub pages using `data-wiki-stub="true"`
- Real pages cleaned of incorrect stub markers
- Redirect alias protection introduced

### 🔹 Phase 4 — Autonomous Editorial Operations
- Stub promotion engine
- External intelligence ingestion
- Hub reinforcement and editorial changelog

### 🔹 Phase 5 — Authority & Timeline Intelligence
- Authority and trust scoring
- Narrative chronology and event mapping
- API-ready intelligence layers

### 🔹 Phase 6 — Predictive Governance & Publishing
- Predictive growth modeling
- Governance prioritization
- Publishing readiness for cross-platform expansion

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

  Prevents accidental promotion of redirect alias pages such as:

/wiki/the-hodl-warriors.html
✅ Structural Validation of Phase 5/6 Outputs

validate-generated-assets.js now validates:

Existence and JSON integrity
Required schema keys (generated_at, schema_version, entries)
Non-empty datasets
✅ Workflow Memory Safeguards
Node.js heap increased to handle large graph assets.
Warning logs emitted when entity-graph.json exceeds safe thresholds.
✅ Fault-Tolerance Visibility
Workflow summary steps expose results of optional generation stages.
🧭 Deterministic Principles
No randomness in generation.
Identical inputs must produce identical outputs.
Generated JSON is authoritative for metadata only.
HTML content remains the canonical source of truth.
Frontend logic must remain synchronized with generated data.
🎨 Canonical Branding

Ensure consistent usage of the following names:

Crypto Moonboys
GraffPUNKS
HODL Wars
HODL Warriors
🔍 SEO & Metadata Standards

All wiki pages must include:

og:title
og:description
og:image
twitter:card
Schema.org Article JSON-LD
Root-relative internal links

Redirect alias pages must include:

<meta name="robots" content="noindex, follow">
<link rel="canonical" href="https://crypto-moonboys.github.io/wiki/{canonical}.html">
🧪 Validation Requirements

Before merging any change:

node scripts/validate-generated-assets.js
node scripts/smoke-test.js

CI failures must block merges.

🚫 Actions Future Agents Must NOT Perform
Regenerate HTML articles from JSON.
Delete or overwrite existing wiki/*.html content.
Introduce randomness into generation.
Modify canonical navigation structures.
Promote redirect alias pages.
Manually edit generated JSON assets.
🧭 Future Opportunities (Phase 7+)
Cross-platform intelligence synchronization (Lorewars integration)
Lightweight graph streaming and visualization
Multilingual lore expansion
Advanced editorial governance dashboards
Timeline-driven narrative navigation
📊 Final Checklist
Task	Status
Multi-repo architecture	✅
Phases 1–6 implemented	✅
Pre–Phase 7 stabilization	✅
Workflow validation updated	✅
Navigation parity achieved	✅
Redirect alias protection	✅
Documentation updated	✅
🎉 Conclusion

The Crypto Moonboys Wiki is now a deterministic, CI-enforced, multi-repository autonomous editorial system. It is stable, scalable, and ready for Phase 7 cross-platform intelligence expansion.

Future enhancements must remain additive and respect the preservation-first architecture established in this release.
